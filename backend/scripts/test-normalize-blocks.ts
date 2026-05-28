import { marked } from 'marked';
marked.use({ gfm: true, breaks: true });

function normalizeBlockMarkers(text: string): string {
  return text
    .replace(/[ \t]+(-{3,})[ \t]+/g, '\n\n$1\n\n')
    .replace(/([^\n])\s+(#{2,6}\s+)/g, '$1\n\n$2')
    .replace(/(^#{2,6}\s+[^\n]+)\n(?!\n)/gm, '$1\n\n')
    .replace(
      /([^\n])\s+(\*\*(?:Вопрос|Question|Задача|Задание|Task)\s+\d+\.\*\*)/gi,
      '$1\n\n$2',
    )
    .replace(/^(#{1,6}[^\n]*)\n(-{3,})\s*$/gm, '$1\n\n$2\n');
}

// Симуляция того, что выдала модель в скриншоте
const broken = `--- ## 📝 Итоговый тест ### Блок 1: Начальные понятия и углы **Вопрос 1.** Один из вертикальных углов равен 54°. Чему равен второй вертикальный угол?
<label><input type="radio" name="q1" value="a"> 36°</label>
<label><input type="radio" name="q1" value="b"> 54°</label>
<label><input type="radio" name="q1" value="c"> 126°</label>
<label><input type="radio" name="q1" value="d"> 180°</label> **Вопрос 2.** Углы ∠ABC и ∠CBD — смежные. Найдите меньший угол.
<label><input type="radio" name="q2" value="a"> 36°</label>
<label><input type="radio" name="q2" value="b"> 45°</label>
<label><input type="radio" name="q2" value="c"> 144°</label>
<label><input type="radio" name="q2" value="d"> 30°</label> ### Блок 2: Треугольники и их элементы **Вопрос 3.** В треугольниках ABC и KMN известно, что AB=KM, BC=MN и угол B = углу M. По какому признаку равны эти треугольники?`;

console.log('=== ВХОД (одной кашей) ===');
console.log(broken);
console.log('\n=== NORMALIZED ===');
const normalized = normalizeBlockMarkers(broken);
console.log(normalized);
console.log('\n=== HTML (marked output) ===');
console.log(marked.parse(normalized));
