import { HtmlPostprocessorService } from '../backend/src/common/services/html-postprocessor.service';
import * as fs from 'fs';

// Мокаем константу, так как мы ее уже обновили в файле
const testHtml = `
<!DOCTYPE html>
<html>
<head>
<title>Тест</title>
</head>
<body>
<div class=\"header\">
  <img src=\"LOGO_PLACEHOLDER\" class=\"header-logo\" alt=\"Logo\">
  <h1>История династии Рюриковичей</h1>
</div>
<p>Математическая модель: \\( T_{start} = 862 \\). Общий период: \\( T = T_{end} - T_{start} \\)</p>
<div class=\"footer-logo\">
  <img src=\"LOGO_PLACEHOLDER\" alt=\"Logo\">
</div>
</body>
</html>
`;

const service = new HtmlPostprocessorService();
const result = service.process(testHtml);

console.log('--- РЕЗУЛЬТАТ ОБРАБОТКИ ---');
console.log(result);

if (result.includes('mathjax')) {
    console.log('✅ MathJax скрипт найден');
} else {
    console.log('❌ MathJax скрипт ОТСУТСТВУЕТ');
}

if (result.includes('data:image/png;base64,')) {
    console.log('✅ Логотип заменен корректно');
} else {
    console.log('❌ Логотип НЕ заменен');
}

fs.writeFileSync('scratch/test_output.html', result);
