import type { GenerationDocument } from '../schema'

/**
 * Эталонная фикстура для разработки — worksheet «Стереометрия».
 * Содержит все основные типы блоков, чтобы можно было визуально проверить
 * рендер без обращения к AI.
 */
export const stereometryWorksheet: GenerationDocument = {
    schemaVersion: 1,
    type: 'worksheet',
    title: 'Рабочий лист: Введение в стереометрию',
    meta: {
        subject: 'Математика',
        grade: '5 класс',
        duration: '45 мин',
        studentName: '',
        date: '',
    },
    blocks: [
        {
            type: 'paragraph',
            id: 'p-intro',
            text: 'Стереометрия — это раздел геометрии, в котором изучаются фигуры в пространстве (объёмные тела). В отличие от планиметрии, где фигуры плоские, объекты стереометрии имеют три измерения: длину, ширину и высоту.',
        },
        {
            type: 'heading',
            id: 'h-task-1',
            level: 2,
            text: 'Задание 1. Основные понятия',
        },
        {
            type: 'fill-blank',
            id: 'fb-1',
            template: 'Раздел геометрии, изучающий фигуры в {{1}}, называется {{2}}. В отличие от фигур на плоскости, объёмные тела имеют {{3}} измерения.',
            blanks: [
                { index: 1, answer: 'пространстве' },
                { index: 2, answer: 'стереометрия' },
                { index: 3, answer: 'три' },
            ],
        },
        {
            type: 'heading',
            id: 'h-task-2',
            level: 2,
            text: 'Задание 2. Классификация фигур',
        },
        {
            type: 'multiple-choice',
            id: 'mc-1',
            question: 'Из предложенного списка выбери только те названия, которые относятся к объёмным телам:',
            multiple: true,
            options: [
                { id: 'a', text: 'Квадрат', correct: false },
                { id: 'b', text: 'Куб', correct: true },
                { id: 'c', text: 'Треугольник', correct: false },
                { id: 'd', text: 'Шар', correct: true },
                { id: 'e', text: 'Прямоугольник', correct: false },
                { id: 'f', text: 'Пирамида', correct: true },
                { id: 'g', text: 'Конус', correct: true },
                { id: 'h', text: 'Прямоугольный параллелепипед', correct: true },
            ],
        },
        {
            type: 'heading',
            id: 'h-task-3',
            level: 2,
            text: 'Задание 3. Анатомия параллелепипеда',
        },
        {
            type: 'paragraph',
            id: 'p-task-3',
            text: 'Рассмотрите прямоугольный параллелепипед. Заполните таблицу количества его элементов:',
        },
        {
            type: 'table',
            id: 't-1',
            headers: ['Элемент фигуры', 'Количество'],
            rows: [
                ['Вершины (точки)', ''],
                ['Рёбра (отрезки)', ''],
                ['Грани (прямоугольники)', ''],
            ],
        },
        {
            type: 'heading',
            id: 'h-task-5',
            level: 2,
            text: 'Задание 4. Формула объёма',
        },
        {
            type: 'paragraph',
            id: 'p-task-5',
            text: 'Для вычисления объёма прямоугольного параллелепипеда используется формула:',
        },
        {
            type: 'math-display',
            id: 'md-1',
            latex: 'V = a \\cdot b \\cdot c',
        },
        {
            type: 'paragraph',
            id: 'p-task-5-2',
            text: 'Где $a, b, c$ — это измерения тела.',
        },
        {
            type: 'fill-blank',
            id: 'fb-2',
            template: 'Как они называются в быту? Заполни пропуски: $a$ — {{1}}, $b$ — {{2}}, $c$ — {{3}}.',
            blanks: [
                { index: 1, answer: 'длина' },
                { index: 2, answer: 'ширина' },
                { index: 3, answer: 'высота' },
            ],
        },
        {
            type: 'heading',
            id: 'h-task-6',
            level: 2,
            text: 'Задание 5. Практический расчёт',
        },
        {
            type: 'callout',
            id: 'c-1',
            variant: 'info',
            title: 'Условие',
            text: 'Найдите объём коробки, если её длина составляет 10 см, ширина — 5 см, а высота — 4 см.',
        },
        {
            type: 'short-answer',
            id: 'sa-1',
            question: 'Решение и ответ:',
            expectedAnswer: '$V = 10 \\cdot 5 \\cdot 4 = 200$ см³',
            expectedLength: 'medium',
        },
        {
            type: 'heading',
            id: 'h-task-10',
            level: 2,
            text: 'Задание 6. Логическая задача',
        },
        {
            type: 'paragraph',
            id: 'p-task-10',
            text: 'Сумма длин всех рёбер куба равна 48 см. Найдите длину одного ребра куба.',
        },
        {
            type: 'callout',
            id: 'c-hint',
            variant: 'tip',
            title: 'Подсказка',
            text: 'Вспомните, сколько всего рёбер у куба и что мы знаем об их длине.',
        },
        {
            type: 'short-answer',
            id: 'sa-2',
            question: 'Решение и ответ:',
            expectedAnswer: '$48 : 12 = 4$ см. У куба 12 равных рёбер.',
            expectedLength: 'medium',
        },
    ],
}
