'use client'

import { useEffect } from 'react'

export default function PrivacyPolicyPage() {
    useEffect(() => {
        window.scrollTo(0, 0)
    }, [])

    return (
        <div className="min-h-screen bg-white">
            <div className="max-w-4xl mx-auto px-4 py-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-6">Политика конфиденциальности</h1>

                <div className="prose prose-lg max-w-none text-gray-700">
                    <p className="text-sm text-gray-500 mb-8">
                        Редакция от {new Date().toLocaleDateString('ru-RU')} г.
                    </p>

                    <section className="mb-8">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">1. ОБЩИЕ ПОЛОЖЕНИЯ</h2>
                        <p className="mb-3">
                            1.1. Настоящая Политика определяет порядок обработки и защиты персональных данных пользователей сайта <strong>prepodavai.ru</strong> (далее – Сайт).
                        </p>
                        <p className="mb-3">
                            1.2. Оператором персональных данных является Индивидуальный предприниматель <strong>Васильева Елизавета Сергеевна</strong> (далее – Оператор).
                        </p>
                        <p className="mb-3">
                            1.3. Использование Сайта и регистрация на нем означают безоговорочное согласие Пользователя с настоящей Политикой.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">2. СОСТАВ ПЕРСОНАЛЬНЫХ ДАННЫХ</h2>
                        <p className="mb-3">
                            2.1. Оператор может обрабатывать следующие данные Пользователя:
                        </p>
                        <ul className="list-disc pl-6 mb-3 space-y-2">
                            <li>Фамилия, имя, отчество;</li>
                            <li>Адрес электронной почты (e-mail);</li>
                            <li>Технические данные, автоматически передаваемые устройством Пользователя (IP-адрес, файлы cookie, информация о браузере).</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">3. ЦЕЛИ ОБРАБОТКИ</h2>
                        <ul className="list-disc pl-6 mb-3 space-y-2">
                            <li>Предоставление доступа к функционалу сервиса PrepodavAI;</li>
                            <li>Идентификация Пользователя в рамках использования сервиса;</li>
                            <li>Связь с Пользователем, направление уведомлений и запросов;</li>
                            <li>Улучшение качества работы Сайта и сервиса.</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">4. ПОРЯДОК ОБРАБОТКИ И ЗАЩИТА</h2>
                        <p className="mb-3">
                            4.1. Оператор принимает необходимые организационные и технические меры для защиты персональных данных от неправомерного доступа.
                        </p>
                        <p className="mb-3">
                            4.2. Оператор не передает персональные данные третьим лицам, за исключением случаев, предусмотренных законодательством РФ.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">5. ИЗМЕНЕНИЕ И УДАЛЕНИЕ ДАННЫХ</h2>
                        <p className="mb-3">
                            5.1. Пользователь может в любой момент изменить (обновить, дополнить) предоставленные им персональные данные в Личном кабинете.
                        </p>
                        <p className="mb-3">
                            5.2. Пользователь может отозвать согласие на обработку данных, направив уведомление на email <strong>support@prepodavai.ru</strong>.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    )
}
