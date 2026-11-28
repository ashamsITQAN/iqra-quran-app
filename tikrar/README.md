<div dir="rtl">

# تكرار — التكرار الدائري المتقاطع

مكوّن برمجي صغير لتطبيقات تحفيظ القرآن، يطبّق طريقة **التكرار الدائري المتقاطع** التي طرحها أحمد شمس في
[مجتمع إتقان](https://community.itqan.dev/d/432): لا تُحفظ الآيات متفرقة ثم تُجمع في النهاية، بل كل مقطع جديد
يُسمع وحده (تلقين)، ثم يوصل فورًا بما قبله (وصل)، وفي الختام يُسرد المقطع كله (سرد).

مثال على ثلاث آيات بالإعدادات الأصلية:

| الخطوة | ما يُسمع | المرات |
| --- | --- | --- |
| تلقين | الآية ١ | ٥ |
| تلقين | الآية ٢ | ٥ |
| وصل | الآيتان ١–٢ | ٥ |
| تلقين | الآية ٣ | ٥ |
| وصل | الآيات ١–٣ | ٥ |
| سرد | الآيات ١–٣ | ٣ |

## ما هو وما ليس هو

المكوّن **منطق فقط**: لا واجهة، ولا مشغّل صوت، ولا مؤقّت، ولا اعتماد على أي مكتبة. يجيب عن سؤالين:

1. **الخطة:** أعطه المقاطع وإعدادات المتعلّم، يعطك قائمة الخطوات: ماذا يُسمع، وبأي ترتيب، وكم مرة، ومدة الجلسة.
2. **الجلسة:** أخبره بما حدث (انتهى تشغيل المقطع، انتهت مهلة الترديد، ضغط المتعلّم «التالي»)، يخبرك بما يفعله المشغّل الآن: شغّل من كذا إلى كذا، أو انتظر كذا، أو انتظر المتعلّم، أو انتهت الجلسة.

لهذا يدخل في أي تطبيق مهما كان مشغّل الصوت فيه أو شكل واجهته.

## التوافق مع التلاوات المزمَّنة

المكوّن متوافق مع التلاوات التي تم تزمينها **على مستوى الكلمة، وعلى مستوى الجملة، وعلى مستوى الآية**. المقطع عنده
مجرد بداية ونهاية بالميلي ثانية في ملف الصوت، فيصلح أن يكون:

| مستوى التزمين | المقطع الذي يُلقَّن | ما يتيحه |
| --- | --- | --- |
| الآية | آية، أو عدة آيات متتالية (`groupUnits`) | التلقين آية آية أو آيتين آيتين… |
| الجملة (موضع وقف داخل الآية الطويلة) | جملة | حفظ الآية الطويلة جملةً جملة ثم وصلها |
| الكلمة | مجموعة كلمات متتالية | مقاطع أقصر، وتلوين الكلمة المتلوّة أثناء الاستماع |

والدالة `locate` تخبرك عند أي لحظة من التشغيل أيّ آية وأيّ جملة وأيّ كلمة تُتلى الآن، لتلوّن الثلاثة معًا إن
توفّر تزمينها. التلاوة غير المزمَّنة لا تصلح لهذه الطريقة، لأن التكرار والوصل يحتاجان معرفة بداية كل مقطع ونهايته.

## الأنظمة وأطر العمل

التنفيذ واحد بست لغات، وكلها تجتاز ملف الاختبارات نفسه (`tests/vectors.txt`):

| المجلد | اللغة | يصلح لـ |
| --- | --- | --- |
| `js/` | JavaScript مع تعريفات TypeScript | الويب، React، Vue، Angular، Svelte، React Native، Ionic و Capacitor، Electron، Node |
| `dart/` | Dart | Flutter لكل المنصات |
| `kotlin/` | Kotlin | أندرويد (Compose والواجهات التقليدية)، Kotlin Multiplatform |
| `swift/` | Swift | iOS و iPadOS و macOS و watchOS (SwiftUI و UIKit) |
| `csharp/` | C#‎ (netstandard2.0) | ‎.NET MAUI، Xamarin، Unity، Avalonia، WPF |
| `python/` | Python | الخوادم والسكربتات وتجهيز البيانات |

لغة أخرى؟ المواصفة في [`SPEC.md`](SPEC.md) قصيرة، وملف الاختبارات نصّي يُقرأ بأي لغة؛ من نفّذها واجتاز الاختبارات
فتنفيذه مطابق.

## الاستعمال (JavaScript)

</div>

```js
import { groupUnits, plan, totalMs, Session, locate } from "./tikrar.js";

// تزمين الآيات بالميلي ثانية من تطبيقك (هنا ثلاث آيات)
const ayahs = [ { id: "2:1", start: 0, end: 4000 }, { id: "2:2", start: 4000, end: 9000 }, { id: "2:3", start: 9000, end: 15000 } ];
const units = groupUnits(ayahs, 1);                       // آية آية؛ 2 = آيتين آيتين
const options = { talqin: 5, wasl: 5, sard: 3, link: "cumulative", mode: "repeat", gap: 1, speed: 1 };

const steps = plan(units, options);                       // الخطة لعرضها على المتعلّم
const minutes = Math.round(totalMs(steps, options) / 60000);

const session = new Session(units, options);
let action = session.start();                             // { type: "play", step: 0, rep: 0, start: 0, end: 4000, rate: 1 }
// شغّل الصوت من action.start إلى action.end، وعند انتهائه:
action = session.ended();                                 // { type: "wait", ms: 4000, ... } مهلة الترديد
// بعد انقضاء المهلة (أو حين يضغط المتعلّم «تابع»):
action = session.resume();                                // التشغيل التالي… حتى { type: "done" }
```

<div dir="rtl">

وعلى الويب يكفي `TikrarPlayer` من `js/tikrar-web.js`، فهو يقود عنصر `<audio>` بنفسه:

</div>

```js
import { TikrarPlayer } from "./tikrar-web.js";
const player = new TikrarPlayer(document.querySelector("audio"), units, options, {
  onAction: (action, session) => { /* اعرض الخطوة والتكرار والمهلة */ },
  onTime: (ms) => { /* لوّن الآية/الجملة/الكلمة: locate(ayahs, ms) */ },
  onDone: () => { /* تمت الجلسة */ },
});
player.start();   // ثم: pause() play() resume() next() previous() restart() stop()
```

<div dir="rtl">

الأسماء نفسها في بقية اللغات مع عُرف كل لغة (`go_to` في Python، و`GoTo` في C#‎)، وفي اللغات الصارمة النوع
تكون مهلة «حتى أضغط» خانة مستقلة `manualGap`. في رأس كل ملف شرح قصير، وملف الاختبار المجاور له مثال استعمال كامل.

### وصل المشغّل في المنصات الأخرى

الجلسة تطلب منك ثلاثة أشياء فقط، وأنت تنفّذها بمشغّل منصتك:

| الإجراء | ما تفعله | ثم تبلّغ |
| --- | --- | --- |
| `play` | انتقل إلى `start` وشغّل بسرعة `rate`، وراقب الموضع حتى يبلغ `end` فأوقف | `ended()` |
| `wait` | شغّل مؤقّتًا مدته `ms` | `resume()` |
| `await` | أظهر زر «تابع» وانتظر | `resume()` |

مراقبة الموضع تكون بما توفّره المنصة (مثل تدفق الموضع في just_audio على Flutter، أو مراقب الوقت الدوري في
AVPlayer على iOS، أو استطلاع الموضع في Media3/ExoPlayer على أندرويد). هذه إشارات لطريق الربط لا كود مجرَّب؛
المجرَّب في هذا المجلد هو المنطق نفسه بكل اللغات، ومشغّل الويب.

## الإعدادات

| الخانة | القيم | الأصل | المعنى |
| --- | --- | --- | --- |
| `talqin` | عدد ≥ ٠ | ٥ | مرات سماع المقطع الجديد وحده |
| `wasl` | عدد ≥ ٠ | ٥ | مرات الوصل بما قبله |
| `sard` | عدد ≥ ٠ | ٣ | مرات سرد المقطع كله في الختام |
| `link` | `cumulative` أو `previous` | `cumulative` | الوصل تراكميًّا من أول المقطع، أو بالمقطع السابق فقط |
| `mode` | `repeat` أو `listen` | `repeat` | أستمع ثم أردّد، أو أستمع فقط |
| `gap` | عدد ≥ ٠ أو `manual` | ١ | مهلة الترديد بنسبة من طول ما سُمع، أو حتى يضغط المتعلّم |
| `speed` | عدد > ٠ | ١ | سرعة التلاوة |

## التجربة والاختبار

- **صفحة تجربة:** `demo/index.html` تعرض الخطة والجلسة، وتعمل بلا صوت (محاكاة) أو مع ملف صوت وتزمينه.
- **الاختبارات:** `node js/test.mjs` و `python3 python/test_tikrar.py`، وبقية اللغات تُشغَّل في خطوات GitHub Actions
  (`.github/workflows/tikrar.yml` في جذر المستودع)، وكلها تقرأ `tests/vectors.txt`.

## المصدر والترخيص

الطريقة لأحمد شمس، وتبلورت بنقاش أعضاء مجتمع إتقان ومحاولاتهم في تنفيذها. هذا المكوّن مستخرج من تطبيق
«اقرأ – القرآن الكريم». **الترخيص لم يُحدَّد بعد.**

</div>

---

## In English

**Tikrar** implements *circular cross repetition* for Quran memorisation apps (method by Ahmad Shams,
[community.itqan.dev/d/432](https://community.itqan.dev/d/432)): each new unit is heard alone (talqin), immediately joined
to what came before (wasl), and the whole passage is recited at the end (sard).

It is logic only — no UI, no audio, no timers, no dependencies. `plan(units, options)` returns the ordered steps and
`Session` tells your player what to do next (`play` a time range, `wait` for the learner, `await` the learner, `done`).
It works with recitations timed at the **word, phrase and ayah** level: a unit is just a start and an end in the audio,
and `locate` reports which ayah, phrase and word is being recited at a moment of playback.

One behaviour, six implementations (JavaScript/TypeScript, Dart, Kotlin, Swift, C#, Python), all passing the same
`tests/vectors.txt`. The definition is [`SPEC.md`](SPEC.md). Licence: not chosen yet.
