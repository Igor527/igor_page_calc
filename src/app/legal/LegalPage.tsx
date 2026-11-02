import React from 'react';
import { useLang } from '@/lib/i18n';

export const LegalPage: React.FC = () => {
  const { isEn } = useLang();

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 sm:p-8 shadow-sm">
        {/* Header */}
        <div className="mb-6 pb-6 border-b border-gray-200 dark:border-gray-800">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 m-0">
            {isEn ? 'Legal & Business Notice' : 'Справка о форме деятельности'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-0">
            {isEn ? 'Official business registration, tax residency, and service delivery terms.' : 'Официальная регистрация, налоговый статус и порядок оказания услуг.'}
          </p>
        </div>

        {/* Content sections */}
        <div className="space-y-6 text-sm sm:text-base leading-relaxed text-gray-700 dark:text-gray-300">
          {/* Entity Details */}
          <section className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 border border-gray-200/80 dark:border-gray-700/80">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <span>🏛</span> {isEn ? 'Registered Business Entity' : 'Регистрационные данные'}
            </h2>
            <div className="space-y-2 text-sm">
              <p>
                <strong>{isEn ? 'Business Name: ' : 'Наименование: '}</strong>
                <span className="font-mono font-medium text-gray-900 dark:text-gray-100">IGOR CHEVELA PR BEOGRAD</span>
              </p>
              <p>
                <strong>{isEn ? 'Legal Form: ' : 'Организационно-правовая форма: '}</strong>
                {isEn ? 'Sole Proprietorship (Preduzetnik)' : 'Индивидуальный предприниматель (Preduzetnik / Sole Proprietor)'}
              </p>
              <p>
                <strong>{isEn ? 'Jurisdiction & Seat: ' : 'Юрисдикция и местонахождение: '}</strong>
                {isEn ? 'Belgrade (Beograd), Republic of Serbia' : 'г. Белград, Республика Сербия'}
              </p>
              <p>
                <strong>{isEn ? 'Operation Mode: ' : 'Формат деятельности: '}</strong>
                {isEn ? '100% remote services delivered digitally over the Internet worldwide' : 'Удаленная профессиональная деятельность через интернет по всему миру'}
              </p>
            </div>
          </section>

          {/* Scope of Services */}
          <section>
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
              <span>📐</span> {isEn ? 'Scope of Professional Services' : 'Виды профессиональной деятельности'}
            </h2>
            <p className="text-sm sm:text-base mb-2">
              {isEn
                ? 'Services provided to international corporate and individual clients include:'
                : 'Услуги предоставляются международным корпоративным и частным клиентам и включают:'}
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-sm">
              <li>
                {isEn
                  ? '3D engineering modeling, architectural visualizations, and procedural scene asset creation in Blender.'
                  : '3D-моделирование инженерных и архитектурных объектов, визуализация и процедурные ассеты в Blender.'}
              </li>
              <li>
                {isEn
                  ? 'Custom software and plugin engineering for Autodesk AutoCAD Civil 3D (.NET C#, Dynamo Python, Civil 3D API) and Blender (bpy).'
                  : 'Разработка авторских плагинов и скриптов автоматизации для Autodesk AutoCAD Civil 3D (.NET C#, Dynamo Python) и Blender (bpy).'}
              </li>
              <li>
                {isEn
                  ? 'BIM services, infrastructure modeling, clash detection, and multi-disciplinary IFC coordination (Civil 3D, InfraWorks, Navisworks).'
                  : 'BIM-услуги, моделирование линейной инфраструктуры, поиск коллизий и сводная координация моделей IFC.'}
              </li>
              <li>
                {isEn
                  ? 'Urban master planning, land development evaluation, zoning analysis, and terrain grading.'
                  : 'Разработка генеральных планов, мастер-планов, градостроительный анализ и вертикальная планировка.'}
              </li>
            </ul>
          </section>

          {/* Banking, Invoicing & Taxation */}
          <section className="bg-blue-50/50 dark:bg-blue-950/20 rounded-xl p-5 border border-blue-100 dark:border-blue-900/50">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
              <span>💳</span> {isEn ? 'Invoicing, Banking & Tax Compliance' : 'Расчеты, эквайринг и налоги'}
            </h2>
            <div className="space-y-2 text-sm">
              <p>
                {isEn
                  ? 'All services and deliverables are provided exclusively in electronic/digital format. Invoices are issued digitally per contract agreements or milestone tasks.'
                  : 'Все услуги и результаты работ передаются исключительно в электронном/цифровом виде. Счета и инвойсы выставляются по проектным этапам или договорам.'}
              </p>
              <p>
                {isEn
                  ? 'Revenues are received directly into the official business bank account of IGOR CHEVELA PR in Serbia via international bank wire transfers (SWIFT/SEPA) or reputable global freelance platforms.'
                  : 'Оплата поступает напрямую на предпринимательский расчетный счет IGOR CHEVELA PR в Сербии банковскими переводами или через международные фриланс-платформы.'}
              </p>
              <p>
                {isEn
                  ? 'All local business taxes, municipal fees, and mandatory social/health contributions are paid in full compliance with the tax laws of the Republic of Serbia.'
                  : 'Все налоги, сборы и социальные отчисления уплачиваются в полном объеме в соответствии с законодательством Республики Сербия.'}
              </p>
            </div>
          </section>

          {/* Contact Details */}
          <section>
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <span>📬</span> {isEn ? 'Contact & Inquiries' : 'Контакты для связи и запросов'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
                <span className="block text-xs text-gray-500 mb-1">{isEn ? 'Primary Email' : 'Основная почта'}</span>
                <a href="mailto:hello@urbanplanner.page" className="text-blue-600 dark:text-blue-400 font-medium hover:underline break-all">
                  hello@urbanplanner.page
                </a>
              </div>
              <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
                <span className="block text-xs text-gray-500 mb-1">{isEn ? 'Alternative Email' : 'Вторая почта'}</span>
                <a href="mailto:igr.sprk.one@gmail.com" className="text-blue-600 dark:text-blue-400 font-medium hover:underline break-all">
                  igr.sprk.one@gmail.com
                </a>
              </div>
              <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
                <span className="block text-xs text-gray-500 mb-1">Telegram</span>
                <a href="https://t.me/igor_chevela" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 font-medium hover:underline">
                  @igor_chevela
                </a>
              </div>
            </div>
          </section>
        </div>

        {/* Back button */}
        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-800 text-center">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 underline hover:no-underline"
          >
            {isEn ? '← Back to Home' : '← Вернуться на главную'}
          </a>
        </div>
      </div>
    </main>
  );
};

export default LegalPage;
