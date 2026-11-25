import React, { useState } from 'react';
import { Users, X, Package, Trophy, Heart, Swords, ArrowLeft, Shuffle } from 'lucide-react';
import {
  LocalSplitConfig,
  SplitItemRule,
  ODD_MATCH_OPTIONS,
  SPLIT_HP_MIN,
  SPLIT_HP_MAX,
  SPLIT_ITEMS_MIN,
  SPLIT_ITEMS_MAX,
  DEFAULT_LOCAL_SPLIT_CONFIG,
  resolveSplitSetupConfig,
  getSplitWinsNeeded,
} from '../utils/splitMode';
import { audioManager } from '../utils/audioManager';

interface SplitSetupModalProps {
  defaultPlayer1Name?: string;
  onStart: (config: LocalSplitConfig) => void;
  onClose: () => void;
}

const ITEM_RULE_OPTIONS: Array<{
  value: SplitItemRule;
  label: string;
  desc: string;
}> = [
  {
    value: 'NONE',
    label: 'NO ITEMS',
    desc: 'Pure steel duel.',
  },
  {
    value: 'FROM_ROUND_2',
    label: 'MATCH 1 NO ITEMS',
    desc: 'Items start Match 2.',
  },
  {
    value: 'FROM_ROUND_1',
    label: 'ITEMS FROM MATCH 1',
    desc: 'Items right away.',
  },
];

export const SplitSetupModal: React.FC<SplitSetupModalProps> = ({
  defaultPlayer1Name,
  onStart,
  onClose,
}) => {
  const [player1Name, setPlayer1Name] = useState<string>(
    (defaultPlayer1Name || '').trim().toUpperCase().slice(0, 14) || 'PLAYER 1'
  );
  const [player2Name, setPlayer2Name] = useState<string>('PLAYER 2');

  const [itemRule, setItemRule] = useState<SplitItemRule>(
    DEFAULT_LOCAL_SPLIT_CONFIG.itemRule
  );
  const [isRandomItemRule, setIsRandomItemRule] = useState<boolean>(false);

  const [totalMatches, setTotalMatches] = useState<number>(
    DEFAULT_LOCAL_SPLIT_CONFIG.totalMatches
  );
  const [isRandomMatches, setIsRandomMatches] = useState<boolean>(false);

  const [startingHp, setStartingHp] = useState<number>(
    DEFAULT_LOCAL_SPLIT_CONFIG.startingHp
  );
  const [isRandomHp, setIsRandomHp] = useState<boolean>(false);

  const [itemsPerShipment, setItemsPerShipment] = useState<number>(
    DEFAULT_LOCAL_SPLIT_CONFIG.itemsPerShipment
  );
  const [isRandomItems, setIsRandomItems] = useState<boolean>(false);

  const winsNeeded = getSplitWinsNeeded(totalMatches);
  const isNoItems = !isRandomItemRule && itemRule === 'NONE';
  const canStart = player1Name.trim().length > 0 && player2Name.trim().length > 0;

  const handleLaunch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canStart) return;
    audioManager.playSound('confirm');
    const config = resolveSplitSetupConfig(
      {
        player1Name,
        player2Name,
        itemRule,
        itemsPerShipment,
        totalMatches,
        startingHp,
      },
      {
        itemRule: isRandomItemRule,
        totalMatches: isRandomMatches,
        startingHp: isRandomHp,
        itemsPerShipment: isRandomItems,
      }
    );
    onStart(config);
  };

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/90 flex items-center justify-center p-2.5 sm:p-4 font-mono select-none animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Split Match Setup"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px), 10px)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 10px)',
      }}
    >
      <form
        onSubmit={handleLaunch}
        className="w-full max-w-3xl max-h-[94dvh] flex flex-col bg-[#0d0c0b] border-2 border-amber-500/60 rounded-2xl overflow-hidden shadow-[0_20px_70px_rgba(0,0,0,0.9)]"
      >
        <div className="h-1 w-full bg-gradient-to-r from-transparent via-amber-400 to-transparent shrink-0" />

        {/* Header */}
        <div className="shrink-0 px-4 py-3 sm:px-6 sm:py-3.5 border-b border-stone-800/90 bg-stone-950/90 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-950/60 border border-amber-500/50 flex items-center justify-center text-amber-400 shrink-0">
              <Users size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400/90">
                Local 2P Pass-and-Play · Single Device
              </div>
              <h2 className="text-base sm:text-xl font-black uppercase tracking-[0.12em] text-white truncate">
                SPLIT MATCH SETUP
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              audioManager.playSound('click');
              onClose();
            }}
            aria-label="Close Split Setup"
            className="w-10 h-10 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Config Body */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 sm:p-5 space-y-4">
          {/* 1. Player Names */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-stone-950/90 border border-stone-800 rounded-xl p-3">
              <label
                htmlFor="split-p1-name"
                className="block text-[10px] font-black uppercase tracking-[0.18em] text-emerald-400 mb-1.5"
              >
                PLAYER 1 NAME
              </label>
              <input
                id="split-p1-name"
                type="text"
                value={player1Name}
                onChange={(e) => setPlayer1Name(e.target.value)}
                maxLength={14}
                placeholder="PLAYER 1"
                className="w-full bg-black/70 border border-stone-700 focus:border-emerald-400 rounded-lg px-3 py-2 text-sm font-black uppercase tracking-[0.18em] text-white outline-none transition-colors"
              />
            </div>

            <div className="bg-stone-950/90 border border-stone-800 rounded-xl p-3">
              <label
                htmlFor="split-p2-name"
                className="block text-[10px] font-black uppercase tracking-[0.18em] text-amber-400 mb-1.5"
              >
                PLAYER 2 NAME
              </label>
              <input
                id="split-p2-name"
                type="text"
                value={player2Name}
                onChange={(e) => setPlayer2Name(e.target.value)}
                maxLength={14}
                placeholder="PLAYER 2"
                className="w-full bg-black/70 border border-stone-700 focus:border-amber-400 rounded-lg px-3 py-2 text-sm font-black uppercase tracking-[0.18em] text-white outline-none transition-colors"
              />
            </div>
          </div>

          {/* 2. Item Rule + Random */}
          <div className="bg-stone-950/90 border border-stone-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-200 flex items-center gap-1.5">
                <Package size={13} className="text-amber-400" />
                ITEM SHIPMENT RULE
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                {isRandomItemRule ? 'RANDOM RULE' : ITEM_RULE_OPTIONS.find(o => o.value === itemRule)?.label}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ITEM_RULE_OPTIONS.map((opt) => {
                const active = !isRandomItemRule && itemRule === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      audioManager.playSound('click');
                      setIsRandomItemRule(false);
                      setItemRule(opt.value);
                    }}
                    className={`text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                      active
                        ? 'bg-amber-950/40 border-amber-400 text-white'
                        : 'bg-black/50 border-stone-800 text-stone-400 hover:border-stone-600 hover:text-stone-200'
                    }`}
                  >
                    <div className="text-[10px] font-black uppercase tracking-[0.12em]">
                      {opt.label}
                    </div>
                    <div className="text-[9px] text-stone-400 mt-0.5 leading-snug">
                      {opt.desc}
                    </div>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  audioManager.playSound('click');
                  setIsRandomItemRule((prev) => !prev);
                }}
                aria-pressed={isRandomItemRule}
                className={`text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                  isRandomItemRule
                    ? 'bg-purple-950/50 border-purple-400 text-white'
                    : 'bg-black/50 border-stone-800 text-stone-400 hover:border-purple-500/60 hover:text-purple-200'
                }`}
              >
                <div className="text-[10px] font-black uppercase tracking-[0.12em] flex items-center gap-1.5">
                  <Shuffle size={11} className={isRandomItemRule ? 'text-purple-300' : 'text-stone-400'} />
                  <span>RANDOM</span>
                </div>
                <div className="text-[9px] text-stone-400 mt-0.5 leading-snug">
                  Pick any rule.
                </div>
              </button>
            </div>
          </div>

          {/* 3. Sliders for Matches, Health, and Items (each with Random toggle) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Total Matches Slider (Odd: 1, 3, 5, 7, 9) */}
            <div className="bg-stone-950/90 border border-stone-800 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="split-matches-slider"
                  className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-200 flex items-center gap-1.5"
                >
                  <Trophy size={13} className="text-amber-400" />
                  <span>MATCHES (ODD)</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-amber-400 tabular-nums">
                    {isRandomMatches ? 'RANDOM' : `${totalMatches} (FT${winsNeeded})`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      audioManager.playSound('click');
                      setIsRandomMatches((prev) => !prev);
                    }}
                    aria-pressed={isRandomMatches}
                    aria-label="Randomize total matches"
                    className={`px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors ${
                      isRandomMatches
                        ? 'bg-purple-600/30 border-purple-400 text-purple-200'
                        : 'bg-black/60 border-stone-700 text-stone-400 hover:text-white hover:border-stone-500'
                    }`}
                  >
                    <Shuffle size={10} />
                    <span>RAND</span>
                  </button>
                </div>
              </div>

              <div className={isRandomMatches ? 'opacity-40' : 'opacity-100'}>
                <input
                  id="split-matches-slider"
                  type="range"
                  min={1}
                  max={9}
                  step={2}
                  value={totalMatches}
                  disabled={isRandomMatches}
                  onChange={(e) => setTotalMatches(Number(e.target.value))}
                  className="w-full h-2 rounded-lg bg-stone-800 accent-amber-400 [color-scheme:dark] cursor-pointer disabled:cursor-not-allowed"
                />
                <div className="flex justify-between text-[9px] font-mono font-bold text-stone-500 mt-1.5 px-0.5 tabular-nums">
                  {ODD_MATCH_OPTIONS.map((m) => (
                    <span
                      key={m}
                      className={!isRandomMatches && totalMatches === m ? 'text-amber-400 font-black' : ''}
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Starting Health (HP) Slider */}
            <div className="bg-stone-950/90 border border-stone-800 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="split-hp-slider"
                  className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-200 flex items-center gap-1.5"
                >
                  <Heart size={13} className="text-red-400" />
                  <span>HEALTH (HP)</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-red-400 tabular-nums">
                    {isRandomHp ? 'RANDOM' : `${startingHp} HP`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      audioManager.playSound('click');
                      setIsRandomHp((prev) => !prev);
                    }}
                    aria-pressed={isRandomHp}
                    aria-label="Randomize starting health"
                    className={`px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors ${
                      isRandomHp
                        ? 'bg-purple-600/30 border-purple-400 text-purple-200'
                        : 'bg-black/60 border-stone-700 text-stone-400 hover:text-white hover:border-stone-500'
                    }`}
                  >
                    <Shuffle size={10} />
                    <span>RAND</span>
                  </button>
                </div>
              </div>

              <div className={isRandomHp ? 'opacity-40' : 'opacity-100'}>
                <input
                  id="split-hp-slider"
                  type="range"
                  min={SPLIT_HP_MIN}
                  max={SPLIT_HP_MAX}
                  step={1}
                  value={startingHp}
                  disabled={isRandomHp}
                  onChange={(e) => setStartingHp(Number(e.target.value))}
                  className="w-full h-2 rounded-lg bg-stone-800 accent-red-400 [color-scheme:dark] cursor-pointer disabled:cursor-not-allowed"
                />
                <div className="flex justify-between text-[9px] font-mono font-bold text-stone-500 mt-1.5 px-0.5 tabular-nums">
                  {[2, 3, 4, 5, 6].map((hp) => (
                    <span
                      key={hp}
                      className={!isRandomHp && startingHp === hp ? 'text-red-400 font-black' : ''}
                    >
                      {hp}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 4. Items Per Shipment Slider + Random */}
          <div
            className={`bg-stone-950/90 border border-stone-800 rounded-xl p-3.5 space-y-2.5 transition-opacity ${
              isNoItems ? 'opacity-45' : 'opacity-100'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="split-items-slider"
                className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-200 flex items-center gap-1.5"
              >
                <Package size={13} className="text-cyan-400" />
                <span>ITEMS PER SHIPMENT</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-cyan-400 tabular-nums">
                  {isNoItems
                    ? 'DISABLED'
                    : isRandomItems
                    ? 'RANDOM (1–8)'
                    : `${itemsPerShipment} EACH`}
                </span>
                <button
                  type="button"
                  disabled={isNoItems}
                  onClick={() => {
                    audioManager.playSound('click');
                    setIsRandomItems((prev) => !prev);
                  }}
                  aria-pressed={isRandomItems}
                  aria-label="Randomize items per shipment"
                  className={`px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-wider flex items-center gap-1 transition-colors ${
                    isNoItems
                      ? 'bg-black/40 border-stone-800 text-stone-600 cursor-not-allowed'
                      : isRandomItems
                      ? 'bg-purple-600/30 border-purple-400 text-purple-200 cursor-pointer'
                      : 'bg-black/60 border-stone-700 text-stone-400 hover:text-white hover:border-stone-500 cursor-pointer'
                  }`}
                >
                  <Shuffle size={10} />
                  <span>RAND</span>
                </button>
              </div>
            </div>

            <div className={isNoItems || isRandomItems ? 'opacity-40' : 'opacity-100'}>
              <input
                id="split-items-slider"
                type="range"
                min={SPLIT_ITEMS_MIN}
                max={SPLIT_ITEMS_MAX}
                step={1}
                value={itemsPerShipment}
                disabled={isNoItems || isRandomItems}
                onChange={(e) => setItemsPerShipment(Number(e.target.value))}
                className="w-full h-2 rounded-lg bg-stone-800 accent-cyan-400 [color-scheme:dark] cursor-pointer disabled:cursor-not-allowed"
              />
              <div className="flex justify-between text-[9px] font-mono font-bold text-stone-500 mt-1.5 px-0.5 tabular-nums">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((count) => (
                  <span
                    key={count}
                    className={!isNoItems && !isRandomItems && itemsPerShipment === count ? 'text-cyan-400 font-black' : ''}
                  >
                    {count}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Footer Actions */}
        <div className="shrink-0 px-4 py-3 sm:px-6 sm:py-3.5 border-t border-stone-800/90 bg-stone-950 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              audioManager.playSound('click');
              onClose();
            }}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-300 hover:text-white font-black text-xs uppercase tracking-[0.18em] flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
          >
            <ArrowLeft size={14} />
            <span>BACK</span>
          </button>

          <button
            type="submit"
            disabled={!canStart}
            className="flex-1 sm:flex-none sm:min-w-[240px] min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-35 text-stone-950 border border-amber-300 font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 shadow-[0_0_24px_rgba(245,158,11,0.3)]"
          >
            <Swords size={15} />
            <span>START SPLIT MATCH</span>
          </button>
        </div>
      </form>
    </div>
  );
};
