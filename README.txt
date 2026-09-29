Mein Brandschutzportal – V8

Direkt als ZIP in das bestehende Netlify-Projekt hochladen.

Neu in V5:
- getrennte Abfrage Grundrissunterlagen / Bestandsaufnahme
- Bestandsaufnahme durch Auftraggeber oder durch uns
- deutlicher Hinweis zur Verantwortung bei eigener Bestandsaufnahme
- Vorschau auf das spätere Tool „Digitale Bestandsaufnahme“
- Objektadresse immer vorhanden
- optionaler Name / Unternehmen
- Nutzungsart als Dropdown, inklusive Mischnutzung und Sonstiges mit Freitext
- DIN-Hinweis korrigiert: A3 Mindestgröße; A4 nur bei Plänen in einzelnen Räumen
- Anfahrt wird nur bei Bestandsaufnahme/Aufmaß durch uns kalkuliert
- keine verwertbaren Pläne erzwingen einen Vor-Ort-Termin

Kalkulationsbasis unverändert:
- Planerstellung: 60 EUR je unterschiedlichem Plan
- CAD-Aufbereitung: 70 EUR je 200-m²-Stufe/Geschoss
- PDF/Papier-Digitalisierung: 210 EUR je 200-m²-Stufe/Geschoss
- Vor-Ort-Aufmaß: 350 EUR je 200-m²-Stufe/Geschoss
- Anfahrt: 0,70 EUR/km + 70 EUR/Stunde, jeweils Hin- und Rückfahrt
- DIN-A3-Rahmen: hinterlegte Mengenstaffel + derzeit 20 % Abwicklungsaufschlag
- Versandkosten Rahmen noch nicht final; später voraussichtlich im prozentualen Aufschlag.

Neu in V6:
- Geschossfrage auf die für die konkrete Kalkulation relevanten Geschosse fokussiert
- deutlicher Hinweis: Flächen dürfen zunächst grob geschätzt werden
- PDF-Download direkt im Browser, ohne Server und ohne externe Bibliothek
- zwei Abschlussoptionen: „Kalkulation absenden & als PDF herunterladen“ sowie „Nur als PDF herunterladen“
- wichtig: Die echte elektronische Übermittlung ist in der Testversion noch NICHT aktiv; dafür wird später ein Backend benötigt.

V7: Worst-Case-Defaults, anonyme Ortsangabe, Geschossarten, Bauphasenvarianten, Hinweise-Freitext und 19 % USt. auf Gesamtsumme.

V9:
- Plananzahl vor Bauphasen-Varianten
- Bauphasen-Pläne ebenfalls mit „weiß ich nicht“
- Nettoeindruck prominent, Brutto darunter
- deutliches Validierungsfeld
- Objektadress-Hilfe reagiert auch auf Hover
- PDF neu strukturiert und mit WinAnsi/Umlauten/Sonderzeichen
- Dark-/Light-Mode-Schalter mit Speicherung im Browser

V9: Objektangaben zuerst; Preisstern erklärt; Warnhinweis verstärkt; Bauphasen-Aufbereitung explizit aus gewählter Geschossfläche; Singular/Plural Plan/Pläne; Rahmenprodukt präzisiert; PDF-Texte als vollständige Sätze und stärker strukturiert; Theme-Schalter im Header repariert.

V10:
- deutsche Theme-Bezeichnungen vereinheitlicht
- unnötige Anfahrt-Zeile entfällt, wenn keine Anfahrt anfällt
- bei unbekannter Plananzahl ausdrücklich 60 EUR netto je Plan
- Light Mode: Ergebnisbox mit Kontur/Schatten, Hinweisboxen hell statt schwarz, bessere Textkontraste
- PDF-Erzeugung unterstützt jetzt automatisch mehrere Seiten bei langen Hinweisen/Inhalten
- helle Ergebnisbox im Dark Mode bewusst beibehalten

V11:
- PDF nennt den Leistungsgegenstand „Flucht- und Rettungspläne“ eindeutig im Titel.
- Bei unbekannter Plananzahl werden für die Vorkalkulation automatisch 2 Pläne je angefangenen 200 m² relevanter Geschossfläche angesetzt.
- Dieselbe Annahme gilt bei unbekannter Anzahl zusätzlicher Bauphasenpläne für die ausgewählten Geschosse.
- PDF enthält jetzt zusätzlich die vollständige Netto-Kostenaufschlüsselung aus der Website (Planerstellung, Rahmen, Aufbereitung, Bauphase, Fahrtstrecke und Fahrzeit soweit zutreffend).

V12:
- PDF: vorläufige Netto-/Bruttokostenschätzung steht direkt nach den Objektdaten auf Seite 1.
- Kundenhinweise stehen vor der detaillierten Kostenaufschlüsselung.
- PDF erhält automatische Seitenangaben „Seite X/Y“ auf jeder Seite.
- Mehrseitige PDFs behalten Kopfzeile und Seitenzählung konsistent bei.

V17:
- PDF optisch an bestehendes Geschäfts-/Rechnungslayout angelehnt, aber mit vorläufigem Portalzeichen statt persönlichem Logo; Geschäftsdaten im Footer.
- Grundrissunterlagen kundenfreundlicher formuliert.
- Bestandsaufnahme vereinfacht: nur noch wer die Angaben vor Ort aufnimmt.
- Geschossart um „Weiß ich nicht / sonstiges Geschoss“ ergänzt.
- Bauphasen-Plananzahl automatisch; konkrete Zahl nur optional überschreibbar.
- Nutzung: „Weiß ich nicht / gemischte Nutzung“, Beschreibung optional.
- Fortschrittsanzeige ca. 3 Minuten / Schritt x von 9.

V18:
- PDF-Kopf entschlackt: kein Name/Adresse oben, nur Portalmarke und eine eindeutige Titelzeile.
- Vorläufiges Logo: schwarze Tür mit orange laufender Person.
- Kunde/Ansprechpartner steht immer in der Metadatenzeile; leer = „ohne Angabe“.
- Footer: Titel „Sachverständiger für vorbeugenden Brandschutz“ ergänzt; Portal-Mailadresse kontakt@mein-brandschutzportal.de.
- Doppelte Leistungsbeschreibung unter dem PDF-Titel entfernt.
- Kostenaufschlüsselung im PDF auf nachvollziehbare Kostenpositionen reduziert; wiederholte Erläuterungstexte werden ausgefiltert.

V19:
- Formular als 9-schrittiger Wizard: pro Seite eine Frage, Zurück/Weiter, Ergebnis am Ende.
- Start immer im hellen Modus; neuer Zwei-Wege-Schalter Hell/Dunkel.
- Ansprechpartner optional ergänzt.
- Punkt 7 sprachlich vereinfacht und Hinweis zur fachlichen Neubewertung von Anzahl/Aufhängorten ergänzt.
- PDF-Kopf an Website-Hierarchie angepasst; vorläufiges Tür/Läufer-Portalzeichen.
- Footer: EIPOS-Titel ergänzt, Spalten entzerrt.
