'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Undo, Redo } from 'lucide-react'
import { useEffect } from 'react'
import { MathInline, MathBlock, preprocessMathInHtml } from './math-extensions'

interface RichTextEditorProps {
    content: string
    onChange?: (html: string) => void
    readOnly?: boolean
}

export default function RichTextEditor({ content, onChange, readOnly = false }: RichTextEditorProps) {
    const editor = useEditor({
        extensions: [
            StarterKit,
            Underline,
            MathInline,
            MathBlock,
        ],
        content: preprocessMathInHtml(content),
        editable: !readOnly,
        immediatelyRender: false,
        editorProps: {
            attributes: {
                class: 'prose prose-sm sm:prose-base focus:outline-none max-w-none min-h-[300px] p-4 text-black prose-p:text-black prose-headings:text-black prose-strong:text-black',
            },
        },
        onUpdate: ({ editor }) => {
            if (onChange) {
                onChange(editor.getHTML())
            }
        },
    })

    useEffect(() => {
        if (editor && content !== editor.getHTML()) {
            const currentHtml = editor.getHTML()
            if (content !== currentHtml && content !== '<p></p>') {
                editor.commands.setContent(preprocessMathInHtml(content))
            }
        }
    }, [content, editor])

    if (!editor) {
        return null
    }

    return (
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white flex flex-col h-full">
            {/* Toolbar */}
            {!readOnly && (
                <div className="flex items-center gap-1 p-2 border-b border-gray-200 bg-gray-50 flex-wrap">
                    <button
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        disabled={!editor.can().chain().focus().toggleBold().run()}
                        className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${editor.isActive('bold') ? 'bg-gray-200 text-primary-600' : 'text-gray-600'}`}
                        title="Bold"
                    >
                        <Bold className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        disabled={!editor.can().chain().focus().toggleItalic().run()}
                        className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${editor.isActive('italic') ? 'bg-gray-200 text-primary-600' : 'text-gray-600'}`}
                        title="Italic"
                    >
                        <Italic className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                        disabled={!editor.can().chain().focus().toggleUnderline().run()}
                        className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${editor.isActive('underline') ? 'bg-gray-200 text-primary-600' : 'text-gray-600'}`}
                        title="Underline"
                    >
                        <UnderlineIcon className="w-4 h-4" />
                    </button>

                    <div className="w-px h-5 bg-gray-300 mx-1"></div>

                    <button
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${editor.isActive('bulletList') ? 'bg-gray-200 text-primary-600' : 'text-gray-600'}`}
                        title="Bullet List"
                    >
                        <List className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${editor.isActive('orderedList') ? 'bg-gray-200 text-primary-600' : 'text-gray-600'}`}
                        title="Numbered List"
                    >
                        <ListOrdered className="w-4 h-4" />
                    </button>

                    <div className="w-px h-5 bg-gray-300 mx-1"></div>

                    <button
                        onClick={() => editor.chain().focus().undo().run()}
                        disabled={!editor.can().chain().focus().undo().run()}
                        className="p-1.5 rounded hover:bg-gray-200 transition-colors text-gray-600 disabled:opacity-50"
                        title="Undo"
                    >
                        <Undo className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => editor.chain().focus().redo().run()}
                        disabled={!editor.can().chain().focus().redo().run()}
                        className="p-1.5 rounded hover:bg-gray-200 transition-colors text-gray-600 disabled:opacity-50"
                        title="Redo"
                    >
                        <Redo className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Editor Content Area */}
            <div className="flex-1 overflow-y-auto">
                <EditorContent editor={editor} />
            </div>
        </div>
    )
}
