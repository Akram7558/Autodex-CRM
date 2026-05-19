// ─────────────────────────────────────────────────────────────────────
// Landing translations — FR (default) + AR (RTL, Modern Standard
// Arabic with Algerian-friendly phrasing where natural).
// ─────────────────────────────────────────────────────────────────────
// Keys are flat-dotted so the `t()` lookup stays O(1). Sections own
// their namespace prefix (`nav.*`, `hero.*`, `problem.*`, …).
// ─────────────────────────────────────────────────────────────────────

import type { Locale } from '@/lib/i18n'

export type TranslationKey = string
export type TranslationDict = Record<TranslationKey, string>

export const translations: Record<Locale, TranslationDict> = {
  fr: {
    // ── Nav ──────────────────────────────────────────────────────
    'nav.brand':            'AutoDex',
    'nav.links.features':   'Fonctionnalités',
    'nav.links.pricing':    'Tarifs',
    'nav.links.faq':        'FAQ',
    'nav.cta.login':        'Connexion',
    'nav.cta.trial':        'Essai gratuit 20j',
    'nav.menu.open':        'Ouvrir le menu',
    'nav.menu.close':       'Fermer le menu',

    // ── Hero ─────────────────────────────────────────────────────
    'hero.badge':           '⚡ Setup en 2 minutes',
    'hero.title.before':    'Le CRM qui aide les concessionnaires algériens à',
    'hero.title.emphasis':  'vendre plus',
    'hero.subtitle':
      'WhatsApp, Messenger, Instagram, catalogue public, IA Lead Scoring — tout ce dont votre showroom a besoin pour transformer chaque prospect en vente.',
    'hero.cta.primary':     'Démarrer mes 20 jours gratuits',
    'hero.cta.secondary':   'Voir une démo',
    'hero.stat.value.1':    '50+',
    'hero.stat.label.1':    'Showrooms actifs',
    'hero.stat.value.2':    '20 jours',
    'hero.stat.label.2':    "D'essai gratuit",
    'hero.stat.value.3':    '7j/7',
    'hero.stat.label.3':    'Support WhatsApp',
    'hero.mock.sidebar.brand':     'AutoDex',
    'hero.mock.sidebar.dashboard': 'Tableau de bord',
    'hero.mock.sidebar.leads':     'Prospects',
    'hero.mock.sidebar.vehicles':  'Véhicules',
    'hero.mock.sidebar.sales':     'Ventes',
    'hero.mock.search':            'Rechercher…',
    'hero.mock.kpi.1.label':       'Total leads',
    'hero.mock.kpi.1.value':       '247',
    'hero.mock.kpi.1.delta':       '+18%',
    'hero.mock.kpi.2.label':       'Ventes',
    'hero.mock.kpi.2.value':       '32',
    'hero.mock.kpi.2.delta':       '+24%',
    'hero.mock.kpi.3.label':       "CA",
    'hero.mock.kpi.3.value':       '14,2M',
    'hero.mock.kpi.3.delta':       '+12%',
    'hero.mock.chart.title':       'Statistiques des ventes',

    // ── Marquee ──────────────────────────────────────────────────
    'marquee.item.1':  'CRM complet',
    'marquee.item.2':  'IA Lead Scoring',
    'marquee.item.3':  'WhatsApp + Messenger + Instagram',
    'marquee.item.4':  'Catalogue public',
    'marquee.item.5':  'Distribution automatique',
    'marquee.item.6':  'Multi-équipe',
    'marquee.item.7':  'Rappels intelligents',
    'marquee.item.8':  'Essai 20 jours',
    'marquee.item.9':  'Support 7j/7',
    'marquee.item.10': "Pas d'engagement",

    // ── Problem ──────────────────────────────────────────────────
    'problem.label':            'LE PROBLÈME',
    'problem.title.before':     'Vos commerciaux perdent',
    'problem.title.emphasis':   '70% des leads',
    'problem.title.after':      'par manque de suivi',
    'problem.subtitle':
      "Trop d'outils, pas de visibilité, équipe désorganisée. AutoDex centralise tout.",
    'problem.card.1.title':     'Messages dispersés',
    'problem.card.1.desc':
      'WhatsApp, Messenger, Instagram, téléphone — vos leads se perdent entre les apps.',
    'problem.card.2.title':     'Équipe désorganisée',
    'problem.card.2.desc':      "Qui suit quel lead ? Qui a appelé ? Personne ne sait.",
    'problem.card.3.title':     'Suivi inexistant',
    'problem.card.3.desc':      'Les leads froids dorment dans un cahier ou un Excel oublié.',
    'problem.card.4.title':     'Pas de visibilité',
    'problem.card.4.desc':
      'Impossible de savoir combien de ventes vous coûtent vos leads perdus.',

    // ── Features ─────────────────────────────────────────────────
    'features.label':           'FONCTIONNALITÉS',
    'features.title':           'Tout pour transformer vos leads en ventes',
    'features.subtitle':        'Construit pour les concessionnaires algériens, en français et en darija.',

    'features.f1.badge':        '🤖 INTELLIGENCE ARTIFICIELLE',
    'features.f1.title':        'IA Lead Scoring chaud/tiède/froid',
    'features.f1.desc':
      'Notre IA analyse 6 facteurs pour scorer chaque lead automatiquement. Concentrez vos commerciaux sur les leads qui vont signer.',
    'features.f1.bullet.1':     'Score actualisé en temps réel',
    'features.f1.bullet.2':     'Suggestions de véhicules par lead',
    'features.f1.bullet.3':     'Meilleure heure pour rappeler',
    'features.f1.bullet.4':     'Historique avec sparkline',
    'features.f1.mock.title':   'Mes leads',
    'features.f1.mock.hot':     '🔥 Chaud',
    'features.f1.mock.warm':    '🌡️ Tiède',
    'features.f1.mock.cold':    '❄️ Froid',
    'features.f1.mock.lead.1':  'Karim B. · BMW X3',
    'features.f1.mock.lead.2':  'Yacine M. · Clio',
    'features.f1.mock.lead.3':  'Amina T. · Sandero',
    'features.f1.mock.score':   'Score',
    'features.f1.mock.dist':    'Distribution leads',

    'features.f2.badge':        '💬 MESSAGERIE INTÉGRÉE',
    'features.f2.title':        'WhatsApp, Messenger, Instagram — un seul écran',
    'features.f2.desc':
      'Tous vos messages clients dans AutoDex. Multi-équipe avec distribution automatique des leads par % aux commerciaux.',
    'features.f2.bullet.1':     'WhatsApp Business intégré',
    'features.f2.bullet.2':     'Distribution round-robin',
    'features.f2.bullet.3':     'Rôles Owner → Manager → Closer → Prospecteur',
    'features.f2.bullet.4':     'Notifications temps réel',
    'features.f2.mock.title':   'Messages',
    'features.f2.mock.bubble.1':'Bonjour, prix de la Clio 5 ?',
    'features.f2.mock.bubble.2':'Bonjour Karim, elle est à 2 850 000 DA. Disponible aujourd’hui.',
    'features.f2.mock.bubble.3':'Possible de la voir cet après-midi ?',
    'features.f2.mock.online':  'En ligne',
    'features.f2.mock.channel.wa': 'WhatsApp',
    'features.f2.mock.channel.fb': 'Messenger',
    'features.f2.mock.channel.ig': 'Instagram',

    'features.f3.badge':        '🚀 CATALOGUE PUBLIC + ESSAI 20J',
    'features.f3.title':        'Votre showroom en ligne, gratuitement',
    'features.f3.desc':
      'Chaque AutoDex inclut un catalogue public (votresite.autodex.store/s/votre-nom) pour partager votre stock avec vos clients. Essai 20 jours sans carte bancaire.',
    'features.f3.bullet.1':     'Catalogue public avec votre logo',
    'features.f3.bullet.2':     'Pré-commandes & commandes véhicules',
    'features.f3.bullet.3':     'Partage WhatsApp en 1 click',
    'features.f3.bullet.4':     "20 jours d'essai gratuit",
    'features.f3.mock.title':   'Showroom Alger Auto',
    'features.f3.mock.share':   'Partager',
    'features.f3.mock.car.1':   'Clio 5 · 2024',
    'features.f3.mock.car.2':   'Sandero · 2023',
    'features.f3.mock.car.3':   'Tucson · 2024',
    'features.f3.mock.price.1': '2 850 000 DA',
    'features.f3.mock.price.2': '1 950 000 DA',
    'features.f3.mock.price.3': '5 200 000 DA',
    'features.f3.mock.status':  'Disponible',
  },

  ar: {
    // ── Nav ──────────────────────────────────────────────────────
    'nav.brand':            'AutoDex',
    'nav.links.features':   'الميزات',
    'nav.links.pricing':    'الأسعار',
    'nav.links.faq':        'الأسئلة الشائعة',
    'nav.cta.login':        'تسجيل الدخول',
    'nav.cta.trial':        'تجربة مجانية 20 يوم',
    'nav.menu.open':        'فتح القائمة',
    'nav.menu.close':       'إغلاق القائمة',

    // ── Hero ─────────────────────────────────────────────────────
    'hero.badge':           '⚡ التثبيت في دقيقتين',
    'hero.title.before':    'نظام CRM الذي يساعد وكلاء السيارات الجزائريين على',
    'hero.title.emphasis':  'بيع أكثر',
    'hero.subtitle':
      'واتساب، ماسنجر، إنستغرام، كتالوج عام، الذكاء الاصطناعي لتقييم العملاء — كل ما يحتاجه معرضك لتحويل كل عميل محتمل إلى عملية بيع.',
    'hero.cta.primary':     'ابدأ تجربتك المجانية لـ 20 يوم',
    'hero.cta.secondary':   'مشاهدة عرض توضيحي',
    'hero.stat.value.1':    '+50',
    'hero.stat.label.1':    'معرض نشط',
    'hero.stat.value.2':    '20 يوم',
    'hero.stat.label.2':    'تجربة مجانية',
    'hero.stat.value.3':    '7/7',
    'hero.stat.label.3':    'دعم على واتساب',
    'hero.mock.sidebar.brand':     'AutoDex',
    'hero.mock.sidebar.dashboard': 'لوحة التحكم',
    'hero.mock.sidebar.leads':     'العملاء',
    'hero.mock.sidebar.vehicles':  'السيارات',
    'hero.mock.sidebar.sales':     'المبيعات',
    'hero.mock.search':            'بحث…',
    'hero.mock.kpi.1.label':       'إجمالي العملاء',
    'hero.mock.kpi.1.value':       '247',
    'hero.mock.kpi.1.delta':       '+18%',
    'hero.mock.kpi.2.label':       'مبيعات',
    'hero.mock.kpi.2.value':       '32',
    'hero.mock.kpi.2.delta':       '+24%',
    'hero.mock.kpi.3.label':       'رقم الأعمال',
    'hero.mock.kpi.3.value':       '14,2 م',
    'hero.mock.kpi.3.delta':       '+12%',
    'hero.mock.chart.title':       'إحصائيات المبيعات',

    // ── Marquee ──────────────────────────────────────────────────
    'marquee.item.1':  'نظام CRM كامل',
    'marquee.item.2':  'الذكاء الاصطناعي لتقييم العملاء',
    'marquee.item.3':  'واتساب + ماسنجر + إنستغرام',
    'marquee.item.4':  'كتالوج عام',
    'marquee.item.5':  'توزيع تلقائي',
    'marquee.item.6':  'فرق متعددة',
    'marquee.item.7':  'تذكيرات ذكية',
    'marquee.item.8':  'تجربة 20 يوم',
    'marquee.item.9':  'دعم 7/7',
    'marquee.item.10': 'بدون التزام',

    // ── Problem ──────────────────────────────────────────────────
    'problem.label':            'المشكلة',
    'problem.title.before':     'مندوبوك يفقدون',
    'problem.title.emphasis':   '70% من العملاء',
    'problem.title.after':      'بسبب نقص المتابعة',
    'problem.subtitle':
      'الكثير من الأدوات، لا توجد رؤية، فريق غير منظم. AutoDex يجمع كل شيء في مكان واحد.',
    'problem.card.1.title':     'رسائل مبعثرة',
    'problem.card.1.desc':
      'واتساب، ماسنجر، إنستغرام، الهاتف — عملاؤك يضيعون بين التطبيقات.',
    'problem.card.2.title':     'فريق غير منظم',
    'problem.card.2.desc':      'من يتابع أي عميل؟ من اتصل به؟ لا أحد يعلم.',
    'problem.card.3.title':     'متابعة منعدمة',
    'problem.card.3.desc':      'العملاء الباردون ينامون في كراس أو ملف Excel منسي.',
    'problem.card.4.title':     'لا توجد رؤية',
    'problem.card.4.desc':
      'يستحيل معرفة كم من المبيعات يكلفك العملاء الضائعون.',

    // ── Features ─────────────────────────────────────────────────
    'features.label':           'الميزات',
    'features.title':           'كل ما تحتاجه لتحويل العملاء إلى مبيعات',
    'features.subtitle':        'مصمم لوكلاء السيارات الجزائريين، بالفرنسية والدارجة.',

    'features.f1.badge':        '🤖 الذكاء الاصطناعي',
    'features.f1.title':        'تقييم العملاء بالذكاء الاصطناعي: ساخن/دافئ/بارد',
    'features.f1.desc':
      'الذكاء الاصطناعي عندنا يحلل 6 عوامل لتقييم كل عميل تلقائيا. ركّز مندوبيك على العملاء الذين سيوقّعون.',
    'features.f1.bullet.1':     'تقييم محدّث في الوقت الحقيقي',
    'features.f1.bullet.2':     'اقتراحات سيارات لكل عميل',
    'features.f1.bullet.3':     'أفضل وقت للاتصال',
    'features.f1.bullet.4':     'سجل بمنحنى سباركلاين',
    'features.f1.mock.title':   'عملائي',
    'features.f1.mock.hot':     '🔥 ساخن',
    'features.f1.mock.warm':    '🌡️ دافئ',
    'features.f1.mock.cold':    '❄️ بارد',
    'features.f1.mock.lead.1':  'كريم ب. · BMW X3',
    'features.f1.mock.lead.2':  'ياسين م. · Clio',
    'features.f1.mock.lead.3':  'أمينة ت. · Sandero',
    'features.f1.mock.score':   'النتيجة',
    'features.f1.mock.dist':    'توزيع العملاء',

    'features.f2.badge':        '💬 المراسلة المدمجة',
    'features.f2.title':        'واتساب، ماسنجر، إنستغرام — شاشة واحدة',
    'features.f2.desc':
      'كل رسائل عملائك في AutoDex. فرق متعددة مع توزيع تلقائي للعملاء بالنسبة المئوية على المندوبين.',
    'features.f2.bullet.1':     'واتساب الأعمال مدمج',
    'features.f2.bullet.2':     'توزيع تناوبي round-robin',
    'features.f2.bullet.3':     'أدوار Owner → Manager → Closer → Prospecteur',
    'features.f2.bullet.4':     'إشعارات في الوقت الحقيقي',
    'features.f2.mock.title':   'الرسائل',
    'features.f2.mock.bubble.1':'السلام عليكم، سعر Clio 5 ؟',
    'features.f2.mock.bubble.2':'مرحبا كريم، السعر 2 850 000 دج. متوفرة اليوم.',
    'features.f2.mock.bubble.3':'يمكن أشوفها بعد الزوال ؟',
    'features.f2.mock.online':  'متصل',
    'features.f2.mock.channel.wa': 'واتساب',
    'features.f2.mock.channel.fb': 'ماسنجر',
    'features.f2.mock.channel.ig': 'إنستغرام',

    'features.f3.badge':        '🚀 كتالوج عام + تجربة 20 يوم',
    'features.f3.title':        'معرضك على الإنترنت، مجانا',
    'features.f3.desc':
      'كل اشتراك AutoDex يتضمن كتالوجا عاما (votresite.autodex.store/s/votre-nom) لمشاركة مخزونك مع عملائك. تجربة 20 يوم بدون بطاقة بنكية.',
    'features.f3.bullet.1':     'كتالوج عام بشعارك',
    'features.f3.bullet.2':     'طلبات مسبقة وطلبات سيارات',
    'features.f3.bullet.3':     'مشاركة على واتساب بنقرة واحدة',
    'features.f3.bullet.4':     'تجربة مجانية لـ 20 يوم',
    'features.f3.mock.title':   'معرض الجزائر للسيارات',
    'features.f3.mock.share':   'مشاركة',
    'features.f3.mock.car.1':   'Clio 5 · 2024',
    'features.f3.mock.car.2':   'Sandero · 2023',
    'features.f3.mock.car.3':   'Tucson · 2024',
    'features.f3.mock.price.1': '2 850 000 دج',
    'features.f3.mock.price.2': '1 950 000 دج',
    'features.f3.mock.price.3': '5 200 000 دج',
    'features.f3.mock.status':  'متوفر',
  },
}
