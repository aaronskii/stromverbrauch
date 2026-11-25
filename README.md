# Stromverbrauch

Eine installierbare iPhone-Web-App im Design „Klar“. Vertragsdaten und Ablesungen bleiben im Speicher der App auf dem Gerät. Die App berechnet dort auch alle Auswertungen.

## Ausprobieren

Öffne **index.html** im Browser und wähle **Beispiel ansehen**. Die Beispieldaten enthalten drei Abrechnungszeiträume. Für den Betrieb auf dem iPhone verwende die veröffentlichte HTTPS-Adresse.

## Über GitHub Pages veröffentlichen

1. Lege die Dateien aus diesem Ordner direkt im Stamm eines GitHub-Repositorys ab. **.nojekyll** und der Ordner **icons** gehören dazu.
2. Wähle im Repository **Settings → Pages → Deploy from a branch** und speichere **main** und **/(root)** als Quelle.
3. Öffne die veröffentlichte Adresse in Safari auf dem iPhone. Wähle **Teilen → Zum Home-Bildschirm**, aktiviere **Als Web-App öffnen** und füge die App hinzu. Nach dem ersten vollständigen Laden steht die installierte App auch offline bereit.

[GitHub Pages einrichten](https://docs.github.com/de/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) · [Web-App auf dem iPhone hinzufügen](https://support.apple.com/de-ch/guide/iphone/iphea86e5236/27/ios/27)

## Ablesen und auswerten

- Unter **Erinnerung** findest du die Einrichtung der Apple-Erinnerung für den 1. jedes Monats. Speichere beim Ablesen das tatsächliche Datum, auch wenn du ein paar Tage später abliest.
- Die Monatsübersicht zeigt auch offene Monate und wählt nach einer neuen Ablesung den jüngsten vollständig erfassten Monat aus. Eine Schraffur kennzeichnet Monatswerte, die aus den umliegenden Ablesungen zeitanteilig geschätzt wurden.
- Das eingegebene Enddatum gehört noch zum Abrechnungszeitraum. Der Zählerstand zu Beginn des Folgetages dient als Schlussstand und bei direkt aufeinanderfolgenden Zeiträumen zugleich als Startstand. Liegen Ablesungen davor und danach vor, kann die App diesen Stand schätzen.
- **Neuer Zeitraum** schlägt die Daten des Folgezeitraums vor und übernimmt Energielieferant und Tarifeingaben. Im Vertrag kannst du sie für jeden Zeitraum anpassen.
- Die Prognose nutzt den mittleren Tagesverbrauch, den festen Arbeitspreis, den monatlichen Grundpreis und die geplante Summe der Abschläge. Bei Teilmonaten wird der Grundpreis nach Tagen anteilig berechnet.

[Apple Erinnerungen einrichten](https://support.apple.com/de-de/102484)
