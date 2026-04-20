'use client'

import { useState, useEffect, useRef } from 'react'
import { Loader2, PenLine, Eye } from 'lucide-react'

// ─── Скрипт для ИНТЕРАКТИВНОГО режима (вставляется в iframe ученика) ──────────
// Автоматически назначает ID всем полям, отслеживает изменения и сообщает родителю
const INTERACTIVE_SCRIPT = `<script>
(function(){
  var count=0,ready=false;

  function autoId(){
    var i=0;
    document.querySelectorAll('input,textarea,select,[contenteditable="true"]').forEach(function(el){
      if(!el.id&&!el.name){el.id='hw_f_'+i;if(el.tagName!=='DIV'&&el.tagName!=='SPAN')el.name=el.id;}
      i++;
    });
  }

  function collect(){
    var d={};
    document.querySelectorAll('input,textarea,select').forEach(function(el){
      var k=el.name||el.id;
      if(!k||el.type==='button'||el.type==='submit'||el.type==='reset')return;
      if(el.type==='checkbox'){d[k]=el.checked;}
      else if(el.type==='radio'){if(el.checked)d['r__'+el.name]=el.value;}
      else{d[k]=el.value;}
    });
    document.querySelectorAll('[contenteditable="true"]').forEach(function(el){
      var k=el.id||el.dataset.key;
      if(k)d[k]=el.innerText||'';
    });
    return d;
  }

  function send(){
    window.parent.postMessage({type:'hw-change',formData:collect(),fieldCount:count},'*');
  }

  function init(){
    if(ready)return; ready=true;
    autoId();
    document.querySelectorAll('input,textarea,select').forEach(function(el){
      if(el.type!=='button'&&el.type!=='submit'&&el.type!=='reset')count++;
    });
    document.querySelectorAll('[contenteditable="true"]').forEach(function(){count++;});

    window.parent.postMessage({type:'hw-ready',fieldCount:count},'*');
    document.addEventListener('input',send);
    document.addEventListener('change',function(e){
      // небольшая задержка для radio/checkbox
      setTimeout(send,10);
    });

    // Перехватываем кнопки "Submit/Отправить" внутри самого HTML
    document.querySelectorAll('button,input[type="submit"]').forEach(function(btn){
      var t=((btn.textContent||btn.value||'')).trim().toLowerCase();
      if(btn.type==='submit'||t==='отправить'||t==='submit'||t==='проверить'||t==='check'||t==='сдать'){
        btn.addEventListener('click',function(e){
          e.preventDefault();e.stopPropagation();
          window.parent.postMessage({type:'hw-submit-click',formData:collect()},'*');
        },true);
      }
    });

    send();
  }

  window.addEventListener('message',function(e){
    if(e.data&&e.data.type==='hw-collect'){
      window.parent.postMessage({type:'hw-formdata',formData:collect()},'*');
    }
  });

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
  window.addEventListener('load',function(){
    init();
    window.parent.postMessage('IFRAME_READY','*');
  });
})();
<\/script>`

// ─── Скрипт для РЕЖИМА ПРОСМОТРА (учитель видит заполненный бланк) ───────────
function buildReadonlyScript(data: Record<string, any>): string {
  return `<script>
(function(){
  var d=${JSON.stringify(data)};
  function apply(){
    // Текстовые поля, textarea, select
    Object.keys(d).forEach(function(k){
      if(k.startsWith('r__'))return;
      var v=d[k];
      var el=document.getElementById(k)||document.querySelector('[name="'+k+'"]');
      if(!el)return;
      if(el.type==='checkbox'){el.checked=!!v;}
      else if(el.tagName==='SELECT'||el.tagName==='TEXTAREA'||el.type==='text'||el.type==='number'||el.type==='email'||!el.type){
        el.value=v!==null&&v!==undefined?String(v):'';
      }
      el.disabled=true;
      el.style.cssText+='background:#EFF6FF!important;border-color:#93C5FD!important;opacity:1!important;';
    });
    // Radio-кнопки
    Object.keys(d).filter(function(k){return k.startsWith('r__');}).forEach(function(k){
      var name=k.slice(3),val=String(d[k]);
      document.querySelectorAll('input[type="radio"][name="'+name+'"]').forEach(function(el){
        el.checked=el.value===val;
        el.disabled=true;
        if(el.checked)el.style.accentColor='#3B82F6';
      });
    });
    // contenteditable
    Object.keys(d).forEach(function(k){
      if(k.startsWith('r__'))return;
      var el=document.getElementById(k);
      if(el&&el.getAttribute('contenteditable')==='true'){
        el.textContent=String(d[k]||'');
        el.contentEditable='false';
        el.style.cssText+='background:#EFF6FF!important;border-color:#93C5FD!important;';
      }
    });
    // Отключаем кнопки сабмита
    document.querySelectorAll('button[type="submit"],input[type="submit"]').forEach(function(b){b.disabled=true;});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply);
  else apply();
  window.addEventListener('load',apply);
})();
<\/script>`
}

// ─── Вспомогательные функции для работы с HTML ───────────────────────────────

/** Извлекает HTML-строку из outputData любого формата */
export function extractHtmlFromOutput(outputData: any): string | null {
  if (!outputData) return null
  let raw: string

  if (typeof outputData === 'string') {
    raw = outputData
  } else if (typeof outputData === 'object') {
    raw = outputData.content || outputData.htmlResult || outputData.html || outputData.text || ''
    if (typeof raw !== 'string') return null
  } else {
    return null
  }

  raw = raw.trim()
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:html)?/i, '').replace(/```$/, '').trim()
  }
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1)
  }
  raw = raw.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')

  const isHtml =
    /<!DOCTYPE html/i.test(raw) ||
    /<html[\s>]/i.test(raw) ||
    /<\/?(div|p|table|ul|ol|h[1-6]|span|input|textarea|select|form|body)[\s>/]/i.test(raw)

  return isHtml ? raw : null
}

/** Удаляет секцию с ответами из HTML для ученика */
function stripAnswerSection(html: string): string {
  // Убираем блок с классом teacher-answers-only (основной метод)
  const byClass = html.replace(/<div[^>]*class="[^"]*teacher-answers-only[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
  if (byClass !== html) return byClass

  // Fallback: убираем по текстовым заголовкам
  const answerHeadings = [
    'Ответы для учителя',
    'Ответы для преподавателя',
    'Ключ ответов',
    'Answer Key',
    'Answers for Teacher',
  ]
  const pattern = new RegExp(
    `(<(h[1-6]|p|div|section)[^>]*>\\s*(?:${answerHeadings.join('|')})[\\s\\S]*$)`,
    'i',
  )
  return html.replace(pattern, '</body></html>')
}

/** Заменяет паттерны ___ на <input> поля для интерактивного заполнения */
function convertBlanksToInputs(html: string): string {
  let counter = 0
  // Заменяем паттерн из 3+ подчёркиваний (или Unicode ___) на input
  return html.replace(/_{3,}/g, () => {
    const id = `blank_${counter++}`
    const width = 120
    return `<input type="text" id="${id}" name="${id}" style="border:none;border-bottom:2px solid #333;width:${width}px;outline:none;background:transparent;font-size:inherit;font-family:inherit;text-align:center;padding:0 4px;" />`
  })
}

const MATHJAX_HEAD = `<script>window.MathJax={tex:{inlineMath:[['$','$'],['\\\\(','\\\\)']],displayMath:[['$$','$$'],['\\\\[','\\\\]']],processEscapes:true},chtml:{fontCache:'global'},startup:{typeset:true}};</script><script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>`

/** Инжектирует скрипт перед </body> и MathJax в <head>, или в конец */
function injectScript(html: string, script: string): string {
  const readySignal = `<script>window.addEventListener('load',function(){window.parent.postMessage('IFRAME_READY','*');});<\/script>`
  const injection = script + readySignal
  const alreadyHasMathJax = /mathjax/i.test(html)

  let result = html
  if (!alreadyHasMathJax) {
    if (/<head[\s>]/i.test(result)) {
      result = result.replace(/<head([^>]*)>/i, `<head$1>${MATHJAX_HEAD}`)
    } else {
      result = MATHJAX_HEAD + result
    }
  }

  if (/<\/body>/i.test(result)) return result.replace(/<\/body>/i, `${injection}</body>`)
  if (/<\/html>/i.test(result)) return result.replace(/<\/html>/i, `${injection}</html>`)
  return result + injection
}

// ─── Компонент ────────────────────────────────────────────────────────────────

interface InteractiveHtmlViewerProps {
  html: string
  generationId: string
  /** Вызывается при каждом изменении поля (только в интерактивном режиме) */
  onFormDataChange?: (generationId: string, data: Record<string, any>, fieldCount: number) => void
  /** Режим только-просмотр: показываем заполненный бланк учителю */
  readOnly?: boolean
  /** Данные для предзаполнения (readOnly режим) */
  prefillData?: Record<string, any>
}

export default function InteractiveHtmlViewer({
  html,
  generationId,
  onFormDataChange,
  readOnly = false,
  prefillData,
}: InteractiveHtmlViewerProps) {
  const [fieldCount, setFieldCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Строим финальный HTML с нужным скриптом
  const scriptToInject = readOnly && prefillData
    ? buildReadonlyScript(prefillData)
    : INTERACTIVE_SCRIPT

  // В интерактивном режиме: убираем ответы и конвертируем ___ → <input>
  // В режиме просмотра: тоже конвертируем ___ → <input>, чтобы buildReadonlyScript
  // мог найти элементы по id (blank_0, blank_1...) и заполнить ответы ученика
  const processedHtml = !readOnly
    ? convertBlanksToInputs(stripAnswerSection(html))
    : convertBlanksToInputs(html)
  const finalHtml = injectScript(processedHtml, scriptToInject)

  // Слушаем сообщения от iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      // Only accept messages from our own iframe (srcdoc has origin 'null')
      if (iframeRef.current && e.source !== iframeRef.current.contentWindow) return
      if (e.data === 'IFRAME_READY') { setIsLoading(false); return }
      if (!e.data || typeof e.data !== 'object') return

      switch (e.data.type) {
        case 'hw-ready':
          setFieldCount(e.data.fieldCount || 0)
          setIsLoading(false)
          break
        case 'hw-change':
          if (!readOnly && onFormDataChange) {
            onFormDataChange(generationId, e.data.formData || {}, e.data.fieldCount ?? fieldCount)
          }
          break
        case 'hw-submit-click':
          // Студент нажал кнопку внутри HTML — тоже сохраняем данные
          if (!readOnly && onFormDataChange) {
            onFormDataChange(generationId, e.data.formData || {}, fieldCount)
          }
          break
      }
    }
    window.addEventListener('message', handler)
    const fallback = setTimeout(() => setIsLoading(false), 6000)
    return () => { window.removeEventListener('message', handler); clearTimeout(fallback) }
  }, [generationId, readOnly, onFormDataChange, fieldCount])

  // Авторазмер iframe по высоте содержимого
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const resize = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document
        if (!doc) return
        const h = (doc.body?.scrollHeight || doc.documentElement?.scrollHeight || 500) + 48
        iframe.style.height = `${Math.max(h, 300)}px`
      } catch { iframe.style.height = '500px' }
    }
    iframe.addEventListener('load', resize)
    const t = setTimeout(resize, 1200)
    return () => { iframe.removeEventListener('load', resize); clearTimeout(t) }
  }, [finalHtml])

  return (
    <div className="relative w-full">
      {/* Индикатор режима */}
      {!isLoading && !readOnly && fieldCount > 0 && (
        <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700 font-medium">
          <PenLine size={15} className="flex-shrink-0" />
          Интерактивный режим — заполните поля прямо в задании
          <span className="ml-auto bg-blue-100 text-blue-600 text-xs font-bold px-2 py-0.5 rounded-full">
            {fieldCount} {fieldCount === 1 ? 'поле' : fieldCount < 5 ? 'поля' : 'полей'}
          </span>
        </div>
      )}

      {!isLoading && readOnly && prefillData && (
        <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-sm text-indigo-700 font-medium">
          <Eye size={15} className="flex-shrink-0" />
          Ответы ученика выделены синим цветом
        </div>
      )}

      {/* Iframe */}
      <div className={`relative border border-gray-200 rounded-2xl overflow-hidden bg-white transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}>
        <iframe
          ref={iframeRef}
          key={`${generationId}-${readOnly ? 'ro' : 'rw'}`}
          srcDoc={finalHtml}
          title={`content-${generationId}`}
          className="w-full border-0 block"
          style={{ minHeight: '300px' }}
          sandbox="allow-scripts allow-same-origin allow-popups allow-modals"
        />
      </div>

      {/* Loader */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white rounded-2xl border border-gray-200">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 text-orange-400 animate-spin" />
            <p className="text-xs text-gray-400">Загрузка...</p>
          </div>
        </div>
      )}
    </div>
  )
}
