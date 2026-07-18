import React from 'react';
import { Plus, CornerDownLeft, Space, Delete } from 'lucide-react';

/**
 * 行尾控制列（每個歌詞行的最右邊）
 *
 * 解鎖編輯時，每行尾巴掛一排淡淡的小鈕，滑過去/點該行才變明顯。
 * 這是「行尾加和弦」「換行」「加減空格」的入口 ——
 * 這些操作都發生在單元「之間」或行的邊界，沒辦法用點某個字來觸發。
 */
export default function LineControls({ onAddChord, onBreak, onSpace, onBackspace }) {
  const btn =
    'inline-flex h-5 w-5 items-center justify-center rounded text-muted opacity-30 ' +
    'transition-opacity hover:bg-surface2 hover:text-accent hover:opacity-100 ' +
    'group-hover/line:opacity-70';

  return (
    <span
      className="no-print ml-1 inline-flex select-none items-center gap-0.5 align-baseline"
      contentEditable={false}
    >
      <button className={btn} onClick={onAddChord} title="行尾加和弦" aria-label="行尾加和弦">
        <Plus size={12} />
      </button>
      <button className={btn} onClick={onSpace} title="加一個空格" aria-label="加一個空格">
        <Space size={12} />
      </button>
      <button className={btn} onClick={onBackspace} title="刪一個字元 / 空格" aria-label="刪一個字元">
        <Delete size={12} />
      </button>
      <button className={btn} onClick={onBreak} title="從這裡換行" aria-label="從這裡換行">
        <CornerDownLeft size={12} />
      </button>
    </span>
  );
}
