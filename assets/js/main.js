/*
 * RAVEVA - zwei kleine Handgriffe, bewusst ohne Bibliotheken.
 *
 * 1. Der Schriftzug passt in eine oder zwei vollstaendige Zeilen.
 * 2. Die Parfum-Seite bekommt ihren Duftfamilien-Filter.
 *
 * Beides ist Zugabe: Ohne JavaScript bleibt die Seite vollstaendig
 * benutzbar.
 *
 * Ein Wort bleibt in einer Zeile; mehrere Woerter werden an der
 * guenstigsten Wortgrenze auf zwei Zeilen verteilt. Die Schriftgroesse
 * richtet sich nach der gemessenen Zeilenbreite, nicht der Zeichenanzahl.
 */
(function () {
    'use strict';

    var marks = document.querySelectorAll('[data-rv-wordmark]');

    for (var i = 0; i < marks.length; i++) {
        fitWordmark(marks[i]);
    }

    function fitWordmark(element) {
        var name = (element.textContent || '').trim().replace(/\s+/g, ' ');
        if (!name) {
            return;
        }
        var words = name.split(' ');
        var lines = [name];
        if (words.length > 1) {
            // Echte Glyphenbreiten beruecksichtigen: WWW ist breiter als III.
            var measure = document.createElement('span');
            measure.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-size:100px';
            measure.setAttribute('aria-hidden', 'true');
            element.appendChild(measure);
            var bestWidth = Infinity;
            for (var split = 1; split < words.length; split++) {
                var first = words.slice(0, split).join(' ');
                var second = words.slice(split).join(' ');
                measure.textContent = first;
                var firstWidth = measure.getBoundingClientRect().width;
                measure.textContent = second;
                var width = Math.max(firstWidth, measure.getBoundingClientRect().width);
                if (width < bestWidth) {
                    bestWidth = width;
                    lines = [first, second];
                }
            }
            element.removeChild(measure);
        }
        // Der vollstaendige Name bleibt fuer Screenreader zusammenhaengend.
        element.setAttribute('aria-label', name);
        element.textContent = '';
        element.classList.add('rv-wordmark--fit');
        var lineElements = [];
        for (var row = 0; row < lines.length; row++) {
            var line = document.createElement('span');
            line.className = 'rv-wordmark__line';
            line.setAttribute('aria-hidden', 'true');
            if (lines.length === 1) {
                var letters = Array.from(name);
                if (typeof Intl !== 'undefined' && Intl.Segmenter) {
                    letters = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(name), function (part) { return part.segment; });
                }
                for (var index = 0; index < letters.length; index++) {
                    var letter = document.createElement('span');
                    letter.className = 'rv-wordmark__letter';
                    letter.textContent = letters[index];
                    letter.style.animationDelay = (0.05 + index * 0.07).toFixed(2) + 's';
                    line.appendChild(letter);
                }
            } else {
                line.textContent = lines[row];
            }
            element.appendChild(line);
            lineElements.push(line);
        }
        var lastWidth = 0;
        var pending = false;
        function fit() {
            pending = false;
            var available = element.clientWidth;
            if (!available) {
                return;
            }
            lastWidth = available;
            element.classList.remove('rv-wordmark--split');
            element.style.fontSize = 'var(--rv-wordmark-max, 15rem)';
            var maximum = parseFloat(window.getComputedStyle(element).fontSize);
            var widest = 0;
            for (var row = 0; row < lineElements.length; row++) {
                var range = document.createRange();
                range.selectNodeContents(lineElements[row]);
                widest = Math.max(widest, range.getBoundingClientRect().width);
            }
            // Ein Pixel Reserve faengt Subpixelrundung beim Schriftsatz ab.
            var size = maximum * Math.min(1, Math.max(1, available - 1) / (widest || 1));
            element.style.fontSize = (Math.floor(size * 100) / 100) + 'px';
            if (lines.length === 1) {
                element.classList.add('rv-wordmark--split');
            }
        }
        function scheduleFit() {
            if (!pending) {
                pending = true;
                window.requestAnimationFrame(fit);
            }
        }
        fit();
        if (window.ResizeObserver) {
            // Beobachtet auch schmalere Container, nicht nur das Browserfenster.
            new ResizeObserver(function () {
                if (element.clientWidth !== lastWidth) {
                    scheduleFit();
                }
            }).observe(element);
        } else {
            window.addEventListener('resize', scheduleFit);
        }
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(scheduleFit);
        }
    }
})();

/*
 * FILTER UND SEITEN DER PARFUM-LISTE
 * ==================================
 *
 * Drei Dinge, die zusammen greifen:
 *
 *   Segmentwahl   genau eine Zielgruppe
 *   Suchfeld      der Name des Dufts, siehe "SUCHE" weiter unten
 *   Chips         beliebig viele Duftfamilien; "Alle" hebt die Wahl auf
 *   Seiten        hoechstens N Duefte zugleich (data-rv-pro-seite)
 *
 * Alle ausgewaehlten Duftfamilien muessen enthalten sein: Frisch und
 * Aquatisch zeigt nur Duefte, die beides tragen. Weitere Duftfamilien
 * am Parfum sind erlaubt.
 *
 * Die Seiten gelten fuer die gefilterte Liste; jede Aenderung der
 * Filter springt auf Seite 1. Ausgeblendete Karten sind display: none,
 * und deren Bilder laedt der Browser nicht - das ist der Grund fuer die
 * Seiten: Bei 150 Duefte mit Fotos laedt die Seite sonst 150 Bilder.
 *
 * Leiste und Seitenzahlen stehen verborgen im Dokument und werden hier
 * eingeblendet bzw. gebaut. Ohne JavaScript stehen alle Duefte da und
 * es gibt keinen Knopf, der nichts tut.
 */
(function () {
    'use strict';

    var leiste = document.querySelector('[data-rv-filter]');
    var raster = document.querySelector('[data-rv-parfums]');

    if (!raster) {
        return;
    }

    var karten = raster.querySelectorAll('.rv-parfum');
    var hinweis = document.querySelector('[data-rv-leer]');
    var pager = document.querySelector('[data-rv-pager]');
    var segmente = leiste ? leiste.querySelectorAll('.rv-segment__btn') : [];
    var chips = leiste ? leiste.querySelectorAll('.rv-chip') : [];
    var zuruecksetzen = leiste ? leiste.querySelector('[data-rv-reset]') : null;
    var suche = leiste ? leiste.querySelector('[data-rv-suche]') : null;
    var leeren = leiste ? leiste.querySelector('[data-rv-suche-leeren]') : null;

    var proSeite = parseInt(raster.getAttribute('data-rv-pro-seite'), 10);
    var zielgruppe = 'alle';
    var suchtext = '';
    var seite = 1;

    if (!(proSeite > 0)) {
        proSeite = 20;
    }

    if (leiste) {
        leiste.hidden = false;
    }

    for (var i = 0; i < segmente.length; i++) {
        segmente[i].addEventListener('click', waehleZielgruppe);
    }

    for (var k = 0; k < chips.length; k++) {
        chips[k].addEventListener('click', waehleChip);
    }

    if (zuruecksetzen) {
        zuruecksetzen.addEventListener('click', function () {
            zielgruppe = 'alle';

            for (var i = 0; i < segmente.length; i++) {
                markiere(segmente[i], segmente[i].getAttribute('data-wert') === 'alle');
            }

            for (var k = 0; k < chips.length; k++) {
                markiere(chips[k], chips[k].getAttribute('data-wert') === 'alle');
            }

            if (suche) {
                suche.value = '';
            }

            suchtext = '';
            seite = 1;
            zeigePassende();
        });
    }

    if (suche) {
        suche.addEventListener('input', function () {
            sucheNach(suche.value);
        });

        suche.addEventListener('keydown', function (ereignis) {
            if (ereignis.key === 'Escape' && suche.value) {
                // Erst das Feld leeren; ein zweites Escape gehoert der Seite.
                ereignis.preventDefault();
                ereignis.stopPropagation();
                suche.value = '';
                sucheNach('');
            } else if (ereignis.key === 'Enter') {
                ereignis.preventDefault();

                // Auf dem Handy die Tastatur einklappen, damit man die Treffer sieht.
                if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
                    suche.blur();
                }
            }
        });

        // Beim Zurueckblaettern traegt der Browser den alten Text wieder ein.
        suchtext = falte(suche.value);
    }

    if (leeren && suche) {
        leeren.addEventListener('click', function () {
            suche.value = '';
            sucheNach('');
            suche.focus();
        });
    }

    zeigePassende();

    function sucheNach(text) {
        suchtext = falte(text);
        seite = 1;
        zeigePassende();
    }

    function waehleZielgruppe(ereignis) {
        var knopf = ereignis.currentTarget;

        zielgruppe = knopf.getAttribute('data-wert');

        for (var i = 0; i < segmente.length; i++) {
            markiere(segmente[i], segmente[i] === knopf);
        }

        seite = 1;
        zeigePassende();
    }

    /*
     * Ein Chip schaltet um. "Alle" loescht die Wahl; ist nach dem
     * Umschalten kein Chip mehr aktiv, springt "Alle" von selbst an -
     * es gibt keinen Zustand ohne sichtbare Wahl.
     */
    function waehleChip(ereignis) {
        var chip = ereignis.currentTarget;
        var wert = chip.getAttribute('data-wert');

        if (wert === 'alle') {
            for (var i = 0; i < chips.length; i++) {
                markiere(chips[i], chips[i] === chip);
            }
        } else {
            markiere(chip, !chip.classList.contains('is-aktiv'));

            var eine = gewaehlteFamilien().length > 0;

            for (var k = 0; k < chips.length; k++) {
                if (chips[k].getAttribute('data-wert') === 'alle') {
                    markiere(chips[k], !eine);
                }
            }
        }

        seite = 1;
        zeigePassende();
    }

    function markiere(knopf, aktiv) {
        knopf.classList.toggle('is-aktiv', aktiv);
        knopf.setAttribute('aria-pressed', aktiv ? 'true' : 'false');
    }

    function gewaehlteFamilien() {
        var gewaehlt = [];

        for (var i = 0; i < chips.length; i++) {
            if (chips[i].classList.contains('is-aktiv') && chips[i].getAttribute('data-wert') !== 'alle') {
                gewaehlt.push(chips[i].getAttribute('data-wert'));
            }
        }

        return gewaehlt;
    }

    /*
     * Erst filtern, dann die aktuelle Seite daraus schneiden. Alles
     * andere wird ausgeblendet - auch die Treffer anderer Seiten.
     */
    function zeigePassende() {
        var familien = gewaehlteFamilien();
        var worte = suchtext ? suchtext.split(' ') : [];

        for (var i = 0; i < karten.length; i++) {
            karten[i].classList.add('rv-parfum--aus');
        }

        var passende = sammle(familien, worte, false);

        // Kein Treffer: noch einmal mit Nachsicht fuer Tippfehler.
        if (!passende.length && worte.length) {
            passende = sammle(familien, worte, true);
        }

        var seiten = Math.max(1, Math.ceil(passende.length / proSeite));

        if (seite > seiten) {
            seite = seiten;
        }

        var von = (seite - 1) * proSeite;
        var bis = Math.min(von + proSeite, passende.length);

        for (var j = von; j < bis; j++) {
            passende[j].classList.remove('rv-parfum--aus');
        }

        if (hinweis) {
            hinweis.hidden = passende.length > 0;
        }

        if (zuruecksetzen) {
            zuruecksetzen.hidden = zielgruppe === 'alle' && familien.length === 0 && !suchtext;
        }

        if (leeren) {
            leeren.hidden = !(suche && suche.value);
        }

        baueSeiten(passende.length, seiten, von, bis);
    }

    function sammle(familien, worte, nachsichtig) {
        var passende = [];

        for (var i = 0; i < karten.length; i++) {
            if (passtZurWahl(karten[i], familien) && passtZumNamen(karten[i], worte, nachsichtig)) {
                passende.push(karten[i]);
            }
        }

        return passende;
    }

    /*
     * SUCHE
     * =====
     *
     * Gesucht wird im Namen des Dufts, so wie er auf der Karte steht.
     * Gross und klein, Akzente und Satzzeichen spielen keine Rolle:
     * "rose" findet "Sable Rosé", "nr 14" findet "Nr. 14", und "suess"
     * findet "Süß" genauso wie "süss". Mehrere Woerter muessen alle
     * vorkommen, die Reihenfolge ist egal.
     *
     * Eine reine Zahl muss als ganzes Wort dastehen - sonst faende
     * "2" auch die Nummern 12 und 20 bis 29.
     *
     * Findet sich so nichts, laeuft dieselbe Suche noch einmal mit
     * Nachsicht: Ab vier Buchstaben darf ein Buchstabe falsch, zu viel,
     * zu wenig oder vertauscht sein ("ambre" findet "Ambra"), ab acht
     * Buchstaben zwei.
     */
    function falte(text) {
        text = String(text || '').toLowerCase()
            .replace(/\u00df/g, 'ss')
            .replace(/\u0153/g, 'oe')
            .replace(/\u00e6/g, 'ae')
            .replace(/\u00f8/g, 'o');

        if (text.normalize) {
            text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        }

        return text.replace(/[^a-z0-9]+/g, ' ').replace(/^ | $/g, '');
    }

    // Der Name in beiden Schreibweisen: "suss" und "suess" fuer "Süß".
    function suchindex(karte) {
        if (karte.rvSuche === undefined) {
            var name = karte.querySelector('.rv-parfum__name');
            var text = name ? name.textContent : '';
            var schlicht = falte(text);
            var umschrift = falte(text
                .replace(/[\u00e4\u00c4]/g, 'ae')
                .replace(/[\u00f6\u00d6]/g, 'oe')
                .replace(/[\u00fc\u00dc]/g, 'ue'));

            karte.rvSuche = umschrift === schlicht ? schlicht : schlicht + ' ' + umschrift;
        }

        return karte.rvSuche;
    }

    function passtZumNamen(karte, worte, nachsichtig) {
        if (!worte.length) {
            return true;
        }

        var index = suchindex(karte);
        var teile = nachsichtig ? index.split(' ') : null;

        for (var i = 0; i < worte.length; i++) {
            var wort = worte[i];

            if (/^[0-9]+$/.test(wort)) {
                if ((' ' + index + ' ').indexOf(' ' + wort + ' ') === -1) {
                    return false;
                }
            } else if (index.indexOf(wort) === -1) {
                if (!nachsichtig || !aehnelt(wort, teile)) {
                    return false;
                }
            }
        }

        return true;
    }

    // Aehnelt das getippte Wort dem Anfang eines Wortes im Namen?
    function aehnelt(wort, teile) {
        var erlaubt = wort.length >= 8 ? 2 : (wort.length >= 4 ? 1 : 0);

        if (!erlaubt) {
            return false;
        }

        for (var i = 0; i < teile.length; i++) {
            for (var mehr = -1; mehr <= 1; mehr++) {
                var anfang = teile[i].slice(0, wort.length + mehr);

                if (anfang.length >= wort.length - 1 && abstand(wort, anfang, erlaubt) <= erlaubt) {
                    return true;
                }
            }
        }

        return false;
    }

    /*
     * Wie viele Tippfehler liegen zwischen zwei Woertern? Ein falscher,
     * fehlender oder ueberzaehliger Buchstabe zaehlt eins, zwei
     * vertauschte Nachbarn ebenfalls.
     */
    function abstand(a, b, grenze) {
        if (Math.abs(a.length - b.length) > grenze) {
            return grenze + 1;
        }

        var vorvor = null;
        var vor = [];
        var j;

        for (j = 0; j <= b.length; j++) {
            vor[j] = j;
        }

        for (var i = 1; i <= a.length; i++) {
            var zeile = [i];

            for (j = 1; j <= b.length; j++) {
                var kosten = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;

                zeile[j] = Math.min(vor[j] + 1, zeile[j - 1] + 1, vor[j - 1] + kosten);

                if (vorvor && i > 1 && j > 1 &&
                    a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) {
                    zeile[j] = Math.min(zeile[j], vorvor[j - 2] + 1);
                }
            }

            vorvor = vor;
            vor = zeile;
        }

        return vor[b.length];
    }

    function passtZurWahl(karte, familien) {
        if (zielgruppe !== 'alle' && karte.getAttribute('data-zielgruppe') !== zielgruppe) {
            return false;
        }

        if (!familien.length) {
            return true;
        }

        for (var i = 0; i < familien.length; i++) {
            if (!traegt(karte.getAttribute('data-familien'), familien[i])) {
                return false;
            }
        }

        return true;
    }

    /*
     * Verglichen wird mit Leerzeichen ringsum. Ohne das wuerde die
     * Suche nach "1" auch in "11" und "15" fuendig - der Filter
     * "Frisch" zeigte dann alles Erdige gleich mit.
     */
    function traegt(merkmale, gesucht) {
        return (' ' + (merkmale || '') + ' ').indexOf(' ' + gesucht + ' ') > -1;
    }

    /*
     * Die Seitenzahlen: Zurueck, Zahlen, Weiter, darueber "21-40 von 156".
     * Bei mehr als sieben Seiten nur die erste, die letzte und die
     * Nachbarn der aktuellen - dazwischen Punkte. Gebaut aus Elementen,
     * nicht aus HTML-Text: Es kommt kein Nutzertext hinein.
     */
    function baueSeiten(anzahl, seiten, von, bis) {
        if (!pager) {
            return;
        }

        while (pager.firstChild) {
            pager.removeChild(pager.firstChild);
        }

        if (seiten <= 1) {
            pager.hidden = true;
            return;
        }

        pager.hidden = false;

        var status = document.createElement('p');
        status.className = 'rv-pager__status';
        status.setAttribute('aria-live', 'polite');
        status.textContent = (von + 1) + '\u2013' + bis + ' ' + (pager.getAttribute('data-rv-von') || 'von') + ' ' + anzahl;
        pager.appendChild(status);

        var zeile = document.createElement('div');
        zeile.className = 'rv-pager__zeile';

        zeile.appendChild(knopf(pager.getAttribute('data-rv-zurueck') || 'Zurück', seite - 1, seite === 1, false));

        var nummern = seitenNummern(seiten);

        for (var i = 0; i < nummern.length; i++) {
            if (nummern[i] === 0) {
                var punkte = document.createElement('span');
                punkte.className = 'rv-pager__punkte';
                punkte.setAttribute('aria-hidden', 'true');
                punkte.textContent = '\u2026';
                zeile.appendChild(punkte);
            } else {
                zeile.appendChild(knopf(String(nummern[i]), nummern[i], false, nummern[i] === seite));
            }
        }

        zeile.appendChild(knopf(pager.getAttribute('data-rv-weiter') || 'Weiter', seite + 1, seite === seiten, false));
        pager.appendChild(zeile);
    }

    function knopf(text, ziel, deaktiviert, aktuell) {
        var b = document.createElement('button');

        b.type = 'button';
        b.className = 'rv-pager__btn' + (aktuell ? ' is-aktiv' : '');
        b.textContent = text;
        b.disabled = !!deaktiviert;

        if (aktuell) {
            b.setAttribute('aria-current', 'page');
        }

        b.addEventListener('click', function () {
            geheZu(ziel);
        });

        return b;
    }

    // 0 steht fuer die Punkte zwischen zwei Zahlen
    function seitenNummern(seiten) {
        var liste = [];
        var i;

        if (seiten <= 7) {
            for (i = 1; i <= seiten; i++) {
                liste.push(i);
            }

            return liste;
        }

        var zeigen = [1, seiten, seite - 1, seite, seite + 1];

        for (i = 1; i <= seiten; i++) {
            if (zeigen.indexOf(i) > -1) {
                if (liste.length && i - liste[liste.length - 1] > 1) {
                    liste.push(0);
                }

                liste.push(i);
            }
        }

        return liste;
    }

    // Beim Seitenwechsel zum Anfang des Rasters - sonst steht man nach
    // dem Klick am Seitenende und sieht die neuen Duefte nicht.
    function geheZu(n) {
        seite = n;
        zeigePassende();
        raster.scrollIntoView({ block: 'start' });
    }
})();

/*
 * KLAPPMENUE
 * ==========
 *
 * Auf schmalen Bildschirmen war die Kopfzeile 146px hoch, das Menue
 * stand auf drei Zeilen. Hier wird es eingeklappt und ueber einen Knopf
 * geoeffnet.
 *
 * Alles haengt an der Klasse rv-top--klappbar: Ohne JavaScript fehlt
 * sie, das Menue bleibt sichtbar und der Knopf verborgen. Auf breiten
 * Bildschirmen wird die Klasse wieder entfernt - dort ist Platz.
 */
(function () {
    'use strict';

    var kopf = document.querySelector('.rv-top');
    var knopf = document.querySelector('[data-rv-nav-toggle]');
    var nav = document.getElementById('rv-nav');

    if (!kopf || !knopf || !nav) {
        return;
    }

    var schmal = window.matchMedia('(max-width: 820px)');

    function richteEin() {
        if (schmal.matches) {
            kopf.classList.add('rv-top--klappbar');
            knopf.hidden = false;
            schliesse();
        } else {
            kopf.classList.remove('rv-top--klappbar');
            knopf.hidden = true;
            nav.classList.remove('is-offen');
        }
    }

    function schliesse() {
        nav.classList.remove('is-offen');
        knopf.setAttribute('aria-expanded', 'false');
    }

    knopf.addEventListener('click', function () {
        var offen = nav.classList.toggle('is-offen');
        knopf.setAttribute('aria-expanded', offen ? 'true' : 'false');
    });

    // Ein Klick auf einen Menuepunkt schliesst das Menue - bei
    // Sprungmarken bliebe es sonst ueber dem Ziel liegen.
    nav.addEventListener('click', function (ereignis) {
        if (ereignis.target.closest('a')) {
            schliesse();
        }
    });

    document.addEventListener('keydown', function (ereignis) {
        if (ereignis.key === 'Escape' && nav.classList.contains('is-offen')) {
            schliesse();
            knopf.focus();
        }
    });

    if (schmal.addEventListener) {
        schmal.addEventListener('change', richteEin);
    } else {
        schmal.addListener(richteEin);
    }

    richteEin();
})();

// Vorher/Nachher: ein Bildrahmen, verschiebbare Trennlinie und nativer Tastaturregler.
(function () {
    'use strict';
    document.querySelectorAll('[data-rv-compare]').forEach(function (frame) {
        var range = frame.querySelector('[data-rv-compare-range]');
        if (!range) return;
        var pointer = null;

        function update() {
            var value = Math.max(0, Math.min(100, Number(range.value)));
            frame.style.setProperty('--rv-compare-position', value + '%');
            range.setAttribute('aria-valuetext', value + ' Prozent Vorher, ' + (100 - value) + ' Prozent Nachher');
            frame.classList.toggle('is-before-only', value === 100);
            frame.classList.toggle('is-after-only', value === 0);
        }

        function move(event) {
            var bounds = frame.getBoundingClientRect();
            if (!bounds.width) return;
            range.value = Math.round(Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * 100);
            update();
        }

        range.addEventListener('input', update);
        range.addEventListener('pointerdown', function (event) {
            if (!event.isPrimary || event.button !== 0) return;
            event.preventDefault();
            pointer = event.pointerId;
            range.focus({ preventScroll: true });
            range.setPointerCapture(pointer);
            move(event);
        });
        range.addEventListener('pointermove', function (event) {
            if (event.pointerId === pointer) move(event);
        });
        function release(event) {
            if (event.pointerId !== pointer) return;
            pointer = null;
            if (range.hasPointerCapture(event.pointerId)) range.releasePointerCapture(event.pointerId);
        }
        range.addEventListener('pointerup', release);
        range.addEventListener('pointercancel', release);
        range.addEventListener('lostpointercapture', function () { pointer = null; });
        range.hidden = false;
        frame.classList.add('is-interactive');
        update();
    });
})();

// Angebotslaufband: Pause auch auf Touchscreens und per Tastatur.
(function () {
    var preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    document.querySelectorAll('[data-rv-ticker]').forEach(function (ticker) {
        var button = ticker.querySelector('[data-rv-ticker-toggle]');
        if (!button) return;
        function updateMotion() { button.hidden = preference.matches; }
        updateMotion();
        if (preference.addEventListener) preference.addEventListener('change', updateMotion);
        button.addEventListener('click', function () {
            var paused = ticker.classList.toggle('is-paused');
            button.setAttribute('aria-pressed', paused ? 'true' : 'false');
            button.setAttribute('aria-label', paused ? 'Lauftext fortsetzen' : 'Lauftext pausieren');
            button.textContent = paused ? 'Weiter' : 'Pause';
        });
    });
})();

// Einblenden beim Scrollen. Betrifft nur, was beim Laden noch unter dem
// Bildschirmrand liegt - nichts Sichtbares verschwindet. Ohne
// IntersectionObserver oder bei "Bewegung reduzieren" passiert nichts.
(function () {
    if (!('IntersectionObserver' in window)) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var auswahl = [
        '.rv-section .rv-head',
        '.rv-section .rv-h2',
        '.rv-split > *',
        '.rv-specials > *',
        '.rv-prices > *',
        '.rv-team > *',
        '.rv-visit > *',
        '.rv-faq__item',
        '.rv-special'
    ].join(',');

    var rand = window.innerHeight * 0.92;
    var elemente = Array.prototype.slice.call(document.querySelectorAll(auswahl)).filter(function (el) {
        return el.getBoundingClientRect().top > rand;
    });
    if (!elemente.length) return;

    // Karten einer Reihe kommen kurz nacheinander: je 90 ms, hoechstens 270.
    elemente.forEach(function (el) {
        var platz = Array.prototype.indexOf.call(el.parentNode.children, el);
        var gestaffelt = el.parentNode.matches('.rv-specials, .rv-prices, .rv-team, .rv-visit');
        if (gestaffelt) el.style.setProperty('--rv-verzug', (Math.min(platz, 3) * 0.09) + 's');
        el.classList.add('rv-reveal');
    });

    var waechter = new IntersectionObserver(function (eintraege) {
        eintraege.forEach(function (eintrag) {
            if (!eintrag.isIntersecting) return;
            var el = eintrag.target;
            waechter.unobserve(el);
            el.classList.add('rv-reveal--da');
            // Danach aufraeumen, damit die Karte ihre eigenen Uebergaenge behaelt.
            window.setTimeout(function () {
                el.classList.remove('rv-reveal', 'rv-reveal--da');
                el.style.removeProperty('--rv-verzug');
            }, 1300);
        });
    }, { rootMargin: '0px 0px -8% 0px' });

    elemente.forEach(function (el) { waechter.observe(el); });
})();

// Detailansicht eines Parfums.
//
// Ein Klick auf eine Parfum-Karte oeffnet ein Fenster (<dialog>) mit dem
// grossen Bild und allen Angaben. Der Inhalt wird aus der Karte selbst
// gebaut - es gibt keine Einzelseiten in Publii, die dafuer angelegt
// werden muessten. Jedes Parfum der Liste ist damit von allein anklickbar.
//
// Die Adresse bekommt "#duft-<schluessel>": So laesst sich ein Duft
// verlinken, und die Zurueck-Taste schliesst das Fenster, statt die Seite
// zu verlassen.
//
// Kann der Browser kein <dialog>, passiert nichts: Die Karten zeigen
// ohnehin alle Angaben.
(function () {
    var dialog = document.querySelector('[data-rv-duft-dialog]');
    if (!dialog || typeof dialog.showModal !== 'function') return;

    var inhalt = dialog.querySelector('[data-rv-duft-inhalt]');
    var zu = dialog.querySelector('[data-rv-duft-zu]');
    var karten = Array.prototype.slice.call(document.querySelectorAll('[data-rv-duft]'));
    if (!inhalt || !karten.length) return;

    var PRAEFIX = 'duft-';
    var offen = null;      // Karte, deren Angaben gerade im Fenster stehen
    var zuletzt = null;    // bekommt nach dem Schliessen den Fokus zurueck

    function findeKarte(schluessel) {
        if (!schluessel) return null;
        for (var i = 0; i < karten.length; i++) {
            if (karten[i].getAttribute('data-rv-duft') === schluessel) return karten[i];
        }
        return null;
    }

    function ausAdresse() {
        var marke = location.hash.replace(/^#/, '');
        return marke.indexOf(PRAEFIX) === 0 ? findeKarte(marke.slice(PRAEFIX.length)) : null;
    }

    function textVon(karte, selektor) {
        var el = karte.querySelector(selektor);
        return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
    }

    function element(tag, klasse, text) {
        var el = document.createElement(tag);
        if (klasse) el.className = klasse;
        if (text) el.textContent = text;
        return el;
    }

    // Baut die Ansicht aus Elementen, nicht aus HTML-Text. Der Aufbau
    // (.rv-detail) ist derselbe wie frueher auf der Einzelseite.
    function baue(karte) {
        var detail = element('div', 'rv-detail');

        // Bild: die Figur der Karte, aber mit dem groesseren Bild aus dem
        // <template>. Fehlt das Bild, kommt der Platzhalter der Karte mit.
        var figur = karte.querySelector('.rv-photo');
        if (figur) {
            figur = figur.cloneNode(true);
            figur.className = 'rv-photo rv-parfum-photo rv-detail__bild';
            var vorlage = karte.querySelector('template[data-rv-duft-bild]');
            var gross = vorlage && vorlage.content ? vorlage.content.querySelector('img') : null;
            var klein = figur.querySelector('img');
            if (gross && klein) {
                figur.replaceChild(gross.cloneNode(true), klein);
            } else if (klein) {
                klein.removeAttribute('loading');
            }
            detail.appendChild(figur);
        }

        var rechts = element('div', 'rv-detail__inhalt');

        var oben = [karte.getAttribute('data-fuer'), textVon(karte, '.rv-parfum__size')]
            .filter(function (teil) { return !!teil; })
            .join(' · ');
        if (oben) rechts.appendChild(element('p', 'rv-eyebrow', oben));

        var titel = element('h2', 'rv-detail__name', textVon(karte, '.rv-parfum__name'));
        titel.id = 'rv-duft-titel';
        rechts.appendChild(titel);

        var preis = textVon(karte, '.rv-parfum__price');
        if (preis) rechts.appendChild(element('p', 'rv-detail__preis', preis));

        var familien = karte.querySelector('.rv-familien');
        if (familien) rechts.appendChild(familien.cloneNode(true));

        var profile = karte.querySelectorAll('.rv-profil');
        for (var i = 0; i < profile.length; i++) {
            rechts.appendChild(profile[i].cloneNode(true));
        }

        var kurz = textVon(karte, '.rv-parfum__text');
        if (kurz) rechts.appendChild(element('p', 'rv-detail__kurz', kurz));

        detail.appendChild(rechts);
        return detail;
    }

    // Die Seite dahinter soll nicht mitscrollen. Der Platz des
    // Rollbalkens wird ausgeglichen, sonst springt das Layout.
    function sperreSeite(an) {
        var wurzel = document.documentElement;
        if (an) {
            var balken = window.innerWidth - wurzel.clientWidth;
            wurzel.style.overflow = 'hidden';
            if (balken > 0) document.body.style.paddingRight = balken + 'px';
        } else {
            wurzel.style.overflow = '';
            document.body.style.paddingRight = '';
        }
    }

    function oeffne(karte, ausVerlauf) {
        if (!karte) return;

        if (offen !== karte) {
            while (inhalt.firstChild) inhalt.removeChild(inhalt.firstChild);
            inhalt.appendChild(baue(karte));
            inhalt.scrollTop = 0;
            offen = karte;
        }

        if (!dialog.open) {
            zuletzt = document.activeElement;
            sperreSeite(true);
            dialog.showModal();
            // Fokus aufs Fenster: Screenreader lesen den Titel, und am
            // Schliessen-Knopf steht nicht sofort ein Fokusring.
            if (dialog.hasAttribute('tabindex')) dialog.focus();
        }

        var schluessel = karte.getAttribute('data-rv-duft');
        if (!ausVerlauf && schluessel && history.pushState) {
            try {
                history.pushState({ rvDuft: schluessel }, '', '#' + PRAEFIX + schluessel);
            } catch (fehler) { /* Adresse bleibt, das Fenster geht trotzdem auf */ }
        }
    }

    // Schliessen ueber Knopf, Escape oder Klick neben das Fenster.
    function schliesse() {
        var imVerlauf = !!(history.state && history.state.rvDuft);
        if (dialog.open) dialog.close();

        if (imVerlauf) {
            history.back();   // nimmt den eigenen Eintrag wieder heraus
        } else if (location.hash.indexOf('#' + PRAEFIX) === 0 && history.replaceState) {
            // per Link direkt hier gelandet: nur die Marke entfernen
            try { history.replaceState(null, '', location.pathname + location.search); } catch (fehler) {}
        }
    }

    dialog.addEventListener('close', function () {
        sperreSeite(false);
        offen = null;
        while (inhalt.firstChild) inhalt.removeChild(inhalt.firstChild);
        if (zuletzt && typeof zuletzt.focus === 'function' && document.contains(zuletzt)) zuletzt.focus();
        zuletzt = null;
    });

    // Escape: selbst schliessen, damit auch die Adresse aufgeraeumt wird.
    dialog.addEventListener('cancel', function (ereignis) {
        ereignis.preventDefault();
        schliesse();
    });

    // Klick auf den abgedunkelten Grund: Das Ziel ist dann das <dialog>
    // selbst, nicht sein Inhalt.
    dialog.addEventListener('click', function (ereignis) {
        if (ereignis.target === dialog) schliesse();
    });

    if (zu) zu.addEventListener('click', schliesse);

    // Zurueck- und Vor-Taste, von Hand geaenderte Adresse.
    function folgeAdresse() {
        var karte = ausAdresse();
        if (karte) {
            oeffne(karte, true);
        } else if (dialog.open) {
            dialog.close();
        }
    }

    window.addEventListener('popstate', folgeAdresse);
    window.addEventListener('hashchange', folgeAdresse);

    // Karte anklickbar machen. "ziel" ist die Karte der Liste, deren
    // Angaben erscheinen - bei den Highlights eine andere als die geklickte.
    function verdrahte(karte, ziel) {
        // Kein sichtbarer Knopf auf der Karte. Der Name wird zum Knopf,
        // der aussieht wie der Name - so bleibt die Ansicht mit der
        // Tastatur und dem Screenreader erreichbar.
        var name = karte.querySelector('.rv-parfum__name');
        if (name && !name.querySelector('.rv-parfum__oeffnen')) {
            var knopf = document.createElement('button');
            knopf.type = 'button';
            knopf.className = 'rv-parfum__oeffnen';
            knopf.setAttribute('aria-haspopup', 'dialog');
            while (name.firstChild) knopf.appendChild(name.firstChild);
            name.appendChild(knopf);
        }

        karte.classList.add('rv-parfum--klickbar');
        karte.addEventListener('click', function (ereignis) {
            if (ereignis.target.closest && ereignis.target.closest('a')) return;      // echte Links gehen vor
            if (window.getSelection && String(window.getSelection())) return;         // jemand markiert Text
            oeffne(ziel);
        });
    }

    karten.forEach(function (karte) {
        if (karte.getAttribute('data-rv-duft')) verdrahte(karte, karte);
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-rv-duft-ziel]'), function (karte) {
        var ziel = findeKarte(karte.getAttribute('data-rv-duft-ziel'));
        if (ziel) verdrahte(karte, ziel);
    });

    // Mit "#duft-..." in der Adresse angekommen: gleich oeffnen.
    folgeAdresse();
})();
