// FR is authored in the HTML. AR overrides every element carrying data-i18n.
// Keys with numeric suffixes (perMonth2, cta3…) exist because data-i18n is
// one-key-per-element; they alias the same string.
const AR = {
  'nav.features': 'المميزات',
  'nav.pricing': 'الأسعار',
  'nav.faq': 'الأسئلة الشائعة',
  'nav.login': 'تسجيل الدخول',
  'hero.line1': 'كراء السيارات،',
  'hero.line2': 'بطريقة احترافية.',
  'hero.sub': 'العقود، التوقيع الإلكتروني عبر واتساب، تدبير الأسطول، الزبناء المحتملون بالذكاء الاصطناعي والمحاسبة المغربية — كل شغلك في أداة واحدة.',
  'hero.ctaStart': 'ابدأ الآن',
  'hero.ctaPricing': 'شاهد الأسعار',
  'shots.dashboard': 'لوحة القيادة — الصورة قريباً',
  'features.title': 'كل ما تحتاجه وكالة عصرية',
  'features.sub': 'مصمم لوكالات كراء السيارات المغربية، من أول عقد إلى الإقفال المحاسبي.',
  'features.contracts.title': 'العقود والتوقيع الإلكتروني',
  'features.contracts.desc': 'أنشئ العقد بصيغة PDF وأرسل رابط التوقيع عبر واتساب. الزبون يوقع من هاتفه وتتوصل بإشعار فوري.',
  'features.fleet.title': 'تدبير الأسطول',
  'features.fleet.desc': 'التوفر، الصيانة، الإصلاحات، الاستهلاك — حالة كل سيارة في الوقت الحقيقي.',
  'features.leads.title': 'زبناء محتملون بالذكاء الاصطناعي — واتساب وGmail',
  'features.leads.desc': 'الطلبات الواردة تُفرز بالذكاء الاصطناعي، والوثائق تُقرأ تلقائياً، وكل طلب يصلك جاهزاً للتحويل إلى عقد.',
  'features.accounting.title': 'محاسبة مغربية',
  'features.accounting.desc': 'اليومية، المخطط المحاسبي، الضمانات، حساب النتائج — قيودك تُنشأ تلقائياً مع كل عملية كراء.',
  'features.team.title': 'عدة مستخدمين وأدوار',
  'features.team.desc': 'أضف فريقك بأدوار مدير أو مسير أو موظف — كل واحد يرى ما يخصه.',
  'features.law.title': 'مطابق للقانون 09-08',
  'features.law.desc': 'بيانات الزبناء محمية: إشعار اللجنة الوطنية، الحق في المحو، والحذف التلقائي.',
  'shots.title': 'الأداة بالصور',
  'shots.sub': 'واجهة واضحة، مصممة ليوميات الوكالة.',
  'shots.newRental': 'عقد جديد — الصورة قريباً',
  'shots.newRentalCap': 'مساعد الكراء الجديد: مسح البطاقة والرخصة، عقد في 4 خطوات',
  'shots.basket': 'سلة الذكاء الاصطناعي — الصورة قريباً',
  'shots.basketCap': 'السلة: طلباتك من واتساب وGmail مفروزة بالذكاء الاصطناعي',
  'shots.accounting': 'المحاسبة — الصورة قريباً',
  'shots.accountingCap': 'المحاسبة: اليومية وحساب النتائج تلقائياً',
  'pricing.title': 'أسعار على قياس أسطولك',
  'pricing.sub': 'التفعيل خلال 24 ساعة عمل. بدون التزام.',
  'pricing.t1.name': 'الأساسي',
  'pricing.t1.cars': 'حتى 5 سيارات',
  'pricing.t1.users': '3 مستخدمين + مدير',
  'pricing.t2.name': 'النمو',
  'pricing.t2.cars': 'من 5 إلى 20 سيارة',
  'pricing.t2.users': '5 مستخدمين + مدير',
  'pricing.t3.name': 'بلا حدود',
  'pricing.t3.cars': 'أكثر من 20 سيارة',
  'pricing.t3.users': '10 مستخدمين + مدير',
  'pricing.allFeatures': 'جميع المميزات',
  'pricing.allFeatures2': 'جميع المميزات',
  'pricing.allFeatures3': 'جميع المميزات',
  'pricing.perMonth': 'درهم/شهر',
  'pricing.perMonth2': 'درهم/شهر',
  'pricing.perMonth3': 'درهم/شهر',
  'pricing.popular': 'الأكثر اختياراً',
  'pricing.cta': 'ابدأ الآن',
  'pricing.cta2': 'ابدأ الآن',
  'pricing.cta3': 'ابدأ الآن',
  'faq.title': 'الأسئلة الشائعة',
  'faq.sub': 'كل ما يجب معرفته قبل البدء.',
  'faq.q1': 'كيف يتم تفعيل حسابي؟',
  'faq.a1': 'أنشئ حسابك، جهّز وكالتك، ثم يقوم فريقنا بتفعيل وصولك خلال 24 ساعة عمل. تواصل معنا عبر واتساب للتسريع.',
  'faq.q2': 'هل بياناتي آمنة؟',
  'faq.a2': 'نعم. كيرافلو مطابق للقانون 09-08: بيانات مشفرة، الحق في المحو، إشعار اللجنة الوطنية وسياسة احتفاظ قابلة للضبط.',
  'faq.q3': 'هل التطبيق متوفر بالعربية؟',
  'faq.a3': 'نعم — التطبيق يشتغل بالفرنسية والعربية (مع العرض من اليمين إلى اليسار)، والإنجليزية اختيارياً.',
  'faq.q4': 'هل هناك التزام بمدة معينة؟',
  'faq.a4': 'لا. الاشتراك شهري وبدون التزام — توقف متى شئت.',
  'faq.q5': 'هل يمكنني تغيير الصيغة لاحقاً؟',
  'faq.a5': 'نعم، في أي وقت. تواصل معنا ونكيّف صيغتك مع حجم أسطولك.',
  'footer.whatsapp': 'واتساب',
  'footer.privacy': 'الخصوصية',
}

// FR snapshot taken from the DOM at load — lets us toggle back without a reload.
const FR = {}

function applyLang(lang) {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n')
    if (lang === 'ar') {
      if (!(key in FR)) FR[key] = el.textContent
      if (AR[key]) el.textContent = AR[key]
    } else if (key in FR) {
      el.textContent = FR[key]
    }
  })
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  const toggle = document.getElementById('langToggle')
  if (toggle) toggle.textContent = lang === 'ar' ? 'Français' : 'العربية'
  try { localStorage.setItem('kf-lang', lang) } catch {}
}

const params = new URLSearchParams(window.location.search)
let saved = params.get('lang')
if (!saved) { try { saved = localStorage.getItem('kf-lang') } catch {} }
let current = saved === 'ar' ? 'ar' : 'fr'
if (current === 'ar') applyLang('ar')

document.getElementById('langToggle')?.addEventListener('click', () => {
  current = current === 'ar' ? 'fr' : 'ar'
  applyLang(current)
})
