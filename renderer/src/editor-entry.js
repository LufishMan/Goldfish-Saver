// 由 esbuild 打包成 renderer/vendor/tiptap.bundle.js（IIFE，掛在 window.TipTap）
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';

window.TipTap = { Editor, StarterKit, Markdown };
