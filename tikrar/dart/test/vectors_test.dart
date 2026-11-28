// Runs the shared vectors (../../tests/vectors.txt) against this implementation.  dart run test/vectors_test.dart
import 'dart:io';
import '../lib/tikrar.dart';

void main() {
  final file = File.fromUri(Platform.script.resolve('../../tests/vectors.txt'));
  var fails = 0, cases = 0, checks = 0, name = '';
  var units = <Unit>[], steps = <Step>[], events = <String>[];
  var opt = const Options();
  void check(String what, String got, String want) {
    checks++;
    if (got != want) {
      fails++;
      stderr.writeln('FAIL $name $what\n  got  $got\n  want $want');
    }
  }

  for (final raw in file.readAsLinesSync()) {
    final line = raw.trim();
    if (line.isEmpty || line.startsWith('#')) continue;
    final sp = line.indexOf(' '), key = sp < 0 ? line : line.substring(0, sp), val = sp < 0 ? '' : line.substring(sp + 1);
    if (key == 'CASE') {
      name = val;
      cases++;
    } else if (key == 'UNITS') {
      units = val == '-' ? [] : val.split(',').map((u) => Unit(int.parse(u.split('-')[0]), int.parse(u.split('-')[1]))).toList();
    } else if (key == 'OPT') {
      var talqin = 5, wasl = 5, sard = 3, link = 'cumulative', mode = 'repeat', manual = false;
      var gap = 1.0, speed = 1.0;
      if (val != '-') {
        for (final kv in val.split(' ')) {
          final k = kv.split('=')[0], v = kv.split('=')[1], n = double.tryParse(v);
          if (k == 'link') link = v;
          if (k == 'mode') mode = v;
          if (k == 'gap' && v == 'manual') manual = true;
          if (n == null) continue;
          if (k == 'talqin') talqin = n.floor();
          if (k == 'wasl') wasl = n.floor();
          if (k == 'sard') sard = n.floor();
          if (k == 'gap') gap = n;
          if (k == 'speed') speed = n;
        }
      }
      opt = Options(talqin: talqin, wasl: wasl, sard: sard, link: link, mode: mode, gap: gap, manualGap: manual, speed: speed);
      steps = plan(units, opt);
    } else if (key == 'PLAN') {
      check('plan', steps.isEmpty ? '-' : planText(steps), val);
    } else if (key == 'TOTAL') {
      check('total', '${totalMs(steps, opt)}', val);
    } else if (key == 'REMAIN') {
      if (val != '-') {
        for (final r in val.split(',')) {
          final at = r.split('=')[0];
          check('remaining $at', '${remainingMs(steps, opt, int.parse(at.split('/')[0]), int.parse(at.split('/')[1]))}', r.split('=')[1]);
        }
      }
    } else if (key == 'EVENTS') {
      events = val.split(',');
    } else if (key == 'ACTIONS') {
      final s = Session(units, opt), got = <String>[];
      for (final e in events) {
        final a = e == 'start'
            ? s.start()
            : e == 'ended'
                ? s.ended()
                : e == 'resume'
                    ? s.resume()
                    : e == 'next'
                        ? s.next()
                        : e == 'previous'
                            ? s.previous()
                            : e == 'restart'
                                ? s.restart()
                                : s.goTo(int.parse(e.substring(5)));
        got.add(actionText(a));
      }
      check('actions', got.join('|'), val);
    } else if (key == 'LOCATE') {
      if (val != '-') {
        for (final r in val.split(',')) {
          final eq = r.indexOf('=');
          check('locate ${r.substring(0, eq)}', '${locate(units, int.parse(r.substring(0, eq)))}', r.substring(eq + 1));
        }
      }
    }
  }
  final g = groupUnits(const [Unit(0, 10, id: '2:1'), Unit(10, 30, id: '2:2'), Unit(30, 45, id: '2:3')], 2);
  check('groupUnits', g.map((u) => '${u.id}@${u.start}-${u.end}').join(','), '2:1-2:2@0-30,2:3@30-45');
  print('dart: $cases cases, $checks checks, $fails failed');
  exit(fails > 0 ? 1 : 0);
}
