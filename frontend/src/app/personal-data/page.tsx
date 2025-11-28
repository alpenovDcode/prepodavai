'use client'

import { useEffect } from 'react'

export default function PersonalDataPage() {
    useEffect(() => {
        window.scrollTo(0, 0)
    }, [])

    return (
        <div className="min-h-screen bg-white">
            <div className="max-w-4xl mx-auto px-4 py-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-6">Согласие на обработку персональных данных</h1>

                <div className="prose prose-lg max-w-none text-gray-700">
                    <p className="text-sm text-gray-500 mb-8">
                        Редакция от {new Date().toLocaleDateString('ru-RU')} г.
                    </p>

                    <p className="mb-6">
                        Регистрируясь на сайте <strong>prepodavai.ru</strong>, я свободно, своей волей и в своем интересе даю конкретное, информированное и сознательное согласие Индивидуальному предпринимателю <strong>Васильевой Елизавете Сергеевне</strong> (далее – Оператор) на обработку моих персональных данных на следующих условиях:
                    </p>

                    <section className="mb-8">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">1. Перечень данных</h2>
                        <p className="mb-3">
                            Согласие дается на обработку следующих данных: фамилия, имя, отчество; адрес электронной почты; технические данные (cookie, IP-адрес).
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">2. Цели обработки</h2>
                        <p className="mb-3">
                            Регистрация на Сайте, предоставление доступа к сервису PrepodavAI, направление информационных сообщений, аналитика работы сервиса.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">3. Действия с данными</h2>
                        <p className="mb-3">
                            Оператор вправе осуществлять сбор, запись, систематизацию, накопление, хранение, уточнение, использование, удаление и уничтожение данных. Обработка может осуществляться как автоматизированным, так и неавтоматизированным способом.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">4. Срок и отзыв</h2>
                        <p className="mb-3">
                            Согласие действует бессрочно до момента его отзыва. Я могу отозвать согласие в любой момент, направив письменное уведомление на электронный адрес <strong>support@prepodavai.ru</strong>.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    )
}
