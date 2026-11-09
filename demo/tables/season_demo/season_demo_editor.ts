import { BitTableEditorBase } from 'bit-tables.editor';
const editor = new BitTableEditorBase();
editor.testPrefix = 'season';
editor.enableColFilters = true;
window.BitTableEditor = editor;
