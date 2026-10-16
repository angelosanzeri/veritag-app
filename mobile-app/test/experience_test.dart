// Studio's /experience payload → the passport plus what the tap unlocked.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:veritag_app/api_client.dart';
import 'package:veritag_app/main.dart';

const _experience = '''
{
  "passport": {
    "uid": "04A1B2C3D4E501", "ctr": 3, "verdict": "authentic", "reason": "ok",
    "chip_authentic": true, "not_replayed": true, "issuer_verified": true, "issuer_id": "iss_1",
    "artwork": {"uid": "04A1B2C3D4E501", "title": "Soglia d'oro", "artist_id": "artist_giulia",
                "binding_id": "b1", "description": "", "image_data_url": "", "video_url": ""},
    "artist": {"artist_id": "artist_giulia", "name": "Giulia Ferraris", "issuer_id": "iss_1",
               "verified": true, "verified_by": [{"curator_id": "cur_hub", "name": "Exteryo Art Hub"}]},
    "artist_verified": true,
    "verified_by": [{"curator_id": "cur_hub", "name": "Exteryo Art Hub"}],
    "exhibitions": []
  },
  "extras": {"uid": "04A1B2C3D4E501", "story": "Nata in una notte d'inverno."},
  "card": {"artist_id": "artist_giulia", "display_name": "Giulia Ferraris", "headline": "Pittrice", "city": "Milano"},
  "unlock": {"token": "pass.sig", "expires_at": 1999999999},
  "views": [
    {"id": "pv_1", "title": "Dallo studio", "intro": "Inediti", "item_count": 2, "locked": false},
    {"id": "pv_2", "title": "Riserva", "intro": "", "item_count": 5, "locked": true}
  ]
}
''';

void main() {
  test('experience parses into passport + Studio extras', () {
    final r = TapResult.fromExperience(jsonDecode(_experience) as Map<String, dynamic>);
    expect(r.passport.verdict, 'authentic');
    expect(r.passport.verifiedBy, ['Exteryo Art Hub']);
    expect(r.studio!.pass, 'pass.sig');
    expect(r.studio!.story, startsWith('Nata'));
    expect(r.studio!.card!.displayName, 'Giulia Ferraris');
    expect(r.studio!.views.map((v) => v.locked), [false, true]);
  });

  test('a record view carries no pass', () {
    final j = jsonDecode(_experience) as Map<String, dynamic>;
    j['unlock'] = null;
    j['card'] = null;
    final r = TapResult.fromExperience(j);
    expect(r.studio!.pass, isNull);
    expect(r.studio!.card, isNull);
  });

  testWidgets('the passport shows the ArtTrust certificate and what the tap unlocked', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.6;
    addTearDown(tester.view.reset);
    final r = TapResult.fromExperience(jsonDecode(_experience) as Map<String, dynamic>);
    await tester.pumpWidget(MaterialApp(home: PassportPage(passport: r.passport, studio: r.studio)));
    await tester.pump();
    expect(find.text('ARTTRUST CERTIFICATE'), findsOneWidget);
    expect(find.text("Curator's guarantee"), findsOneWidget);
    expect(find.text('PRIVATE VIEW UNLOCKED'), findsOneWidget);
    expect(find.text('PRIVATE VIEW'), findsOneWidget); // the locked one
    await tester.scrollUntilVisible(find.text('Save contact'), 300, scrollable: find.byType(Scrollable).first);
    expect(find.text('Book a studio visit'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  test('vCard link is built on the Studio base', () {
    expect(StudioClient('studio.veritag.art').vcardUrl('artist_giulia'), 'https://studio.veritag.art/artists/artist_giulia/vcard');
  });
}
