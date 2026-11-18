export interface LegalNoticeEntityItem {
  label: string;
  value: string;
}

export interface LegalNoticeContent {
  title: string;
  subtitle: string;
  entityTitle: string;
  entityItems: LegalNoticeEntityItem[];
  servicesTitle: string;
  servicesIntro: string;
  servicesItems: string[];
  financeTitle: string;
  financeParagraphs: string[];
  contactsTitle: string;
  contactEmail1: string;
  contactEmail2: string;
  contactTelegram: string;
  contactTelegramUrl?: string;
}

export interface LegalDataBundle {
  version?: number;
  exportedAt?: number;
  ru: LegalNoticeContent;
  en: LegalNoticeContent;
}

export const DEFAULT_LEGAL_RU: LegalNoticeContent = {
  title: 'Справка о деятельности',
  subtitle: 'Официальная регистрация, налоговый статус и порядок оказания услуг.',
  entityTitle: 'Регистрационные данные',
  entityItems: [
    { label: 'Наименование:', value: 'IGOR CHEVELA PR BEOGRAD' },
    { label: 'Организационно-правовая форма:', value: 'Индивидуальный предприниматель (Preduzetnik / Sole Proprietor)' },
    { label: 'Юрисдикция и местонахождение:', value: 'г. Белград, Республика Сербия' },
    { label: 'Формат деятельности:', value: 'Удаленная профессиональная деятельность через интернет по всему миру' },
  ],
  servicesTitle: 'Виды профессиональной деятельности',
  servicesIntro: 'Услуги предоставляются международным корпоративным и частным клиентам и включают:',
  servicesItems: [
    '3D-моделирование инженерных и архитектурных объектов, визуализация и процедурные ассеты в Blender.',
    'Разработка авторских плагинов и скриптов автоматизации для Autodesk AutoCAD Civil 3D (.NET C#, Dynamo Python) и Blender (bpy).',
    'BIM-услуги, моделирование линейной инфраструктуры, поиск коллизий и сводная координация моделей IFC.',
    'Разработка генеральных планов, мастер-планов, градостроительный анализ и вертикальная планировка.',
  ],
  financeTitle: 'Расчеты, эквайринг и налоги',
  financeParagraphs: [
    'Все услуги и результаты работ передаются исключительно в электронном/цифровом виде. Счета и инвойсы выставляются по проектным этапам или договорам.',
    'Оплата поступает напрямую на предпринимательский расчетный счет IGOR CHEVELA PR в Сербии банковскими переводами или через международные фриланс-платформы.',
    'Все налоги, сборы и социальные отчисления уплачиваются в полном объеме в соответствии с законодательством Республики Сербия.',
  ],
  contactsTitle: 'Контакты для связи и запросов',
  contactEmail1: 'hello@urbanplanner.page',
  contactEmail2: 'igr.sprtk.one@gmail.com',
  contactTelegram: '@igor_chevela',
  contactTelegramUrl: 'https://t.me/igor_chevela',
};

export const DEFAULT_LEGAL_EN: LegalNoticeContent = {
  title: 'Legal & Business Notice',
  subtitle: 'Official business registration, tax residency, and service delivery terms.',
  entityTitle: 'Registered Business Entity',
  entityItems: [
    { label: 'Business Name:', value: 'IGOR CHEVELA PR BEOGRAD' },
    { label: 'Legal Form:', value: 'Sole Proprietorship (Preduzetnik)' },
    { label: 'Jurisdiction & Seat:', value: 'Belgrade (Beograd), Republic of Serbia' },
    { label: 'Operation Mode:', value: '100% remote services delivered digitally over the Internet worldwide' },
  ],
  servicesTitle: 'Scope of Professional Services',
  servicesIntro: 'Services provided to international corporate and individual clients include:',
  servicesItems: [
    '3D engineering modeling, architectural visualizations, and procedural scene asset creation in Blender.',
    'Custom software and plugin engineering for Autodesk AutoCAD Civil 3D (.NET C#, Dynamo Python, Civil 3D API) and Blender (bpy).',
    'BIM services, infrastructure modeling, clash detection, and multi-disciplinary IFC coordination (Civil 3D, InfraWorks, Navisworks).',
    'Urban master planning, land development evaluation, zoning analysis, and terrain grading.',
  ],
  financeTitle: 'Invoicing, Banking & Tax Compliance',
  financeParagraphs: [
    'All services and deliverables are provided exclusively in electronic/digital format. Invoices are issued digitally per contract agreements or milestone tasks.',
    'Revenues are received directly into the official business bank account of IGOR CHEVELA PR in Serbia via international bank wire transfers (SWIFT/SEPA) or reputable global freelance platforms.',
    'All local business taxes, municipal fees, and mandatory social/health contributions are paid in full compliance with the tax laws of the Republic of Serbia.',
  ],
  contactsTitle: 'Contact & Inquiries',
  contactEmail1: 'hello@urbanplanner.page',
  contactEmail2: 'igr.sprtk.one@gmail.com',
  contactTelegram: '@igor_chevela',
  contactTelegramUrl: 'https://t.me/igor_chevela',
};

export const DEFAULT_LEGAL_BUNDLE: LegalDataBundle = {
  version: 1,
  ru: DEFAULT_LEGAL_RU,
  en: DEFAULT_LEGAL_EN,
};
