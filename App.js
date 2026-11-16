import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, useColorScheme, Vibration, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { WORDS } from './src/words';

const STORE_KEY = 'imposter-word-game-v1';
const CATEGORIES = [...Object.keys(WORDS), 'Custom'];
const DEFAULT_SETTINGS = { imposters: 1, mode: 'blank', hint: true, knows: true, timer: 120, cats: Object.keys(WORDS), custom: '' };
const SAMPLE_PLAYERS = ['Aarav', 'Maya', 'Kabir', 'Zoe', 'Ishaan'];

const LIGHT = { bg: '#EEF0F6', surface: '#FFFFFF', ink: '#16182B', muted: '#5C6178', line: '#D6D9E5', accent: '#E23D55', accentInk: '#FFFFFF', crew: '#2C62E8', good: '#18865A', sealed: '#1E2140', sealedInk: '#F2F3FA' };
const DARK = { bg: '#0F1120', surface: '#181B30', ink: '#ECEEF8', muted: '#9DA2BD', line: '#2B2F4B', accent: '#FF5A70', accentInk: '#1A0A0E', crew: '#6E97FF', good: '#3CC48A', sealed: '#262A4C', sealedInk: '#F2F3FA' };

const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const tap = () => Haptics.selectionAsync().catch(() => {});

function parseCustom(text) {
  return text.split('\n')
    .map((l) => l.split(/[,/|]/).map((x) => x.trim()).filter(Boolean))
    .filter((p) => p.length >= 1)
    .map((p) => [p[0], p[1] || p[0]]);
}
const maxImposters = (n) => Math.max(1, Math.floor((n - 1) / 2));

export default function App() {
  return (
    <SafeAreaProvider>
      <Game />
    </SafeAreaProvider>
  );
}

function Game() {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const s = useMemo(() => makeStyles(C), [C]);

  const [loaded, setLoaded] = useState(false);
  const [players, setPlayers] = useState(SAMPLE_PLAYERS);
  const [sample, setSample] = useState(true);
  const [scores, setScores] = useState({});
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [used, setUsed] = useState([]);
  const [round, setRound] = useState(null);
  const [screen, setScreen] = useState('setup');
  const [error, setError] = useState('');

  // Load saved players, settings and scores
  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY).then((raw) => {
      if (raw) {
        try {
          const d = JSON.parse(raw);
          if (Array.isArray(d.players)) { setPlayers(d.players); setSample(false); }
          setScores(d.scores || {});
          setSettings({ ...DEFAULT_SETTINGS, ...(d.settings || {}) });
          setUsed(d.used || []);
        } catch {}
      }
    }).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded || sample) return;
    AsyncStorage.setItem(STORE_KEY, JSON.stringify({ players, scores, settings, used: used.slice(-200) })).catch(() => {});
  }, [loaded, sample, players, scores, settings, used]);

  const update = (patch) => setSettings((st) => ({ ...st, ...patch }));

  function startRound() {
    setError('');
    if (players.length < 3) return setError('Add at least 3 players to start.');
    const pool = [];
    settings.cats.forEach((c) => (WORDS[c] || []).forEach((pair) => pool.push({ cat: c, pair })));
    if (settings.cats.includes('Custom')) parseCustom(settings.custom).forEach((pair) => pool.push({ cat: 'Custom', pair }));
    if (!pool.length) return setError('Pick at least one word category, or add your own words.');

    let fresh = pool.filter((x) => !used.includes(x.pair.join('|')));
    let nextUsed = used;
    if (!fresh.length) { fresh = pool; nextUsed = []; }
    const choice = pick(fresh);
    setUsed([...nextUsed, choice.pair.join('|')]);

    const flip = Math.random() < 0.5;
    const word = flip ? choice.pair[1] : choice.pair[0];
    const alt = flip ? choice.pair[0] : choice.pair[1];
    const n = Math.min(settings.imposters, maxImposters(players.length));
    const idx = players.map((_, i) => i);
    const imposters = shuffle(idx).slice(0, n);
    const order = shuffle(idx);
    if (imposters.includes(order[0]) && Math.random() < 0.6) {
      const k = order.findIndex((i) => !imposters.includes(i));
      [order[0], order[k]] = [order[k], order[0]];
    }
    setScores((sc) => { const o = { ...sc }; players.forEach((p) => { if (!(p in o)) o[p] = 0; }); return o; });
    setSample(false);
    setRound({ cat: choice.cat, word, alt, imposters, order, revealIdx: 0, accused: null, guessed: null, deltas: null });
    setScreen('pass');
  }

  function quitRound() { setRound(null); setScreen('setup'); }

  function finishRound(guessed) {
    const r = round;
    const caught = r.imposters.includes(r.accused);
    const d = {};
    if (!caught) r.imposters.forEach((i) => { d[players[i]] = 3; });
    else if (guessed) d[players[r.accused]] = 2;
    else players.forEach((p, i) => { if (!r.imposters.includes(i)) d[p] = 1; });
    setScores((sc) => { const o = { ...sc }; Object.entries(d).forEach(([p, v]) => { o[p] = (o[p] || 0) + v; }); return o; });
    setRound({ ...r, guessed, deltas: d });
  }

  if (!loaded) return <View style={[s.fill, { backgroundColor: C.bg }]} />;

  const common = { C, s, players, settings, round, setRound, setScreen, quitRound };
  let body;
  if (screen === 'setup') {
    body = (
      <Setup {...common} sample={sample} scores={scores} error={error}
        onAdd={(name) => {
          const v = name.trim(); if (!v) return false;
          const list = sample ? [] : players;
          if (list.some((p) => p.toLowerCase() === v.toLowerCase())) { setError(`${v} is already playing.`); return false; }
          setError(''); setSample(false); setPlayers([...list, v]); return true;
        }}
        onRemove={(i) => {
          const next = players.filter((_, k) => k !== i);
          setSample(false); setPlayers(next);
          update({ imposters: Math.min(settings.imposters, maxImposters(next.length)) });
        }}
        update={update} onStart={startRound} onResetScores={() => setScores({})}
      />
    );
  } else if (screen === 'pass') body = <Pass {...common} />;
  else if (screen === 'reveal') body = <Reveal {...common} />;
  else if (screen === 'clues') body = <Clues {...common} />;
  else if (screen === 'vote') body = <Vote {...common} />;
  else body = <Result {...common} scores={scores} onGuess={finishRound} onFinish={finishRound} onAgain={startRound} />;

  return (
    <SafeAreaView style={[s.fill, { backgroundColor: C.bg }]} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {round ? <KeepAwake /> : null}
      <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {body}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function KeepAwake() { useKeepAwake(); return null; }

/* ---------- Shared bits ---------- */
function Btn({ s, title, onPress, variant = 'dark', disabled }) {
  const style = variant === 'red' ? s.btnRed : variant === 'ghost' ? s.btnGhost : s.btn;
  const text = variant === 'red' ? s.btnRedText : variant === 'ghost' ? s.btnGhostText : s.btnText;
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={() => { tap(); onPress(); }}
      style={({ pressed }) => [style, disabled && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}>
      <Text style={text}>{title}</Text>
    </Pressable>
  );
}
function LinkBtn({ s, title, onPress }) {
  return <Pressable onPress={onPress} style={s.link}><Text style={s.linkText}>{title}</Text></Pressable>;
}
function Header({ s, sub }) {
  return (
    <View style={s.brand}>
      <View style={{ flexShrink: 1 }}>
        <Text style={s.label}>{sub}</Text>
        <Text style={s.h1}>Imposter</Text>
      </View>
      <View style={s.tape}><Text style={s.tapeText}>TRUST NO ONE</Text></View>
    </View>
  );
}
function Seg({ s, options, value, onChange, maxEnabled }) {
  return (
    <View style={s.seg}>
      {options.map(([v, label]) => {
        const on = v === value; const disabled = maxEnabled != null && v > maxEnabled;
        return (
          <Pressable key={String(v)} disabled={disabled} onPress={() => { tap(); onChange(v); }}
            style={[s.segBtn, on && s.segOn, disabled && { opacity: 0.35 }]} accessibilityState={{ selected: on, disabled }}>
            <Text style={[s.segText, on && s.segTextOn]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
function Toggle({ s, title, hint, value, onChange }) {
  return (
    <Pressable style={s.toggleRow} onPress={() => { tap(); onChange(!value); }} accessibilityRole="switch" accessibilityState={{ checked: value }}>
      <View style={{ flex: 1 }}>
        <Text style={s.strong}>{title}</Text>
        {hint ? <Text style={s.hint}>{hint}</Text> : null}
      </View>
      <View style={[s.switch, value && s.switchOn]}><View style={[s.knob, value && s.knobOn]} /></View>
    </Pressable>
  );
}
function Progress({ s, total, idx }) {
  return (
    <View style={s.progress}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[s.dot, i < idx && s.dotDone, i === idx && s.dotNow]} />
      ))}
    </View>
  );
}

/* ---------- Setup ---------- */
function Setup({ s, C, players, sample, scores, settings, error, onAdd, onRemove, update, onStart, onResetScores }) {
  const [name, setName] = useState('');
  const maxI = maxImposters(players.length);
  const hasScores = Object.values(scores).some((v) => v > 0);
  const add = () => { if (onAdd(name)) setName(''); };
  const customCount = parseCustom(settings.custom).length;

  return (
    <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <Header s={s} sub="PASS-THE-PHONE WORD GAME" />

      <View style={s.panel}>
        <View style={s.rowBetween}>
          <Text style={s.label}>PLAYERS · {players.length}</Text>
          {sample ? <Text style={s.hint}>Example names, replace with yours</Text> : null}
        </View>
        <View style={s.chips}>
          {players.length === 0 ? <Text style={s.muted}>No players yet. Add everyone who's playing.</Text> : null}
          {players.map((p, i) => (
            <View key={p} style={s.chip}>
              <Text style={s.chipText}>{p}</Text>
              <Pressable onPress={() => onRemove(i)} hitSlop={8} accessibilityLabel={`Remove ${p}`} style={s.chipX}>
                <Text style={s.chipXText}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
        <View style={s.addRow}>
          <TextInput value={name} onChangeText={setName} onSubmitEditing={add} placeholder="Add a player's name"
            placeholderTextColor={C.muted} maxLength={20} style={[s.input, { flex: 1 }]} returnKeyType="done" blurOnSubmit={false} />
          <Pressable onPress={add} style={s.addBtn}><Text style={s.btnText}>Add</Text></Pressable>
        </View>
      </View>

      <View style={s.panel}>
        <Text style={s.label}>RULES FOR THIS GAME</Text>
        <View style={s.setting}>
          <Text style={s.strong}>What the imposter gets</Text>
          <Seg s={s} value={settings.mode} onChange={(v) => update({ mode: v })} options={[['blank', 'No word'], ['similar', 'A similar word']]} />
          <Text style={s.hint}>{settings.mode === 'blank'
            ? "The imposter is told they're the imposter and has to bluff."
            : 'The imposter gets a close word (Coffee vs Tea) and may not even realise they are the odd one out.'}</Text>
        </View>
        {settings.mode === 'similar' ? (
          <Toggle s={s} title="Imposter knows their role" hint={'Off is the classic "Undercover" style.'} value={settings.knows} onChange={(v) => update({ knows: v })} />
        ) : null}
        <Toggle s={s} title="Show the category to everyone" hint={settings.mode === 'blank' ? 'The imposter always sees the category as a hint. This shows it to the crew too.' : 'Gives the imposter a fighting chance.'} value={settings.hint} onChange={(v) => update({ hint: v })} />
        <View style={s.setting}>
          <Text style={s.strong}>Number of imposters</Text>
          <Seg s={s} value={settings.imposters} onChange={(v) => update({ imposters: v })} maxEnabled={maxI} options={[[1, '1'], [2, '2'], [3, '3']]} />
          <Text style={s.hint}>{maxI < 3 ? `Up to ${maxI} with ${players.length} players.` : 'More imposters, more chaos.'}</Text>
        </View>
        <View style={s.setting}>
          <Text style={s.strong}>Discussion timer</Text>
          <Seg s={s} value={settings.timer} onChange={(v) => update({ timer: v })} options={[[60, '1 min'], [120, '2 min'], [180, '3 min'], [0, 'Off']]} />
        </View>
      </View>

      <View style={s.panel}>
        <Text style={s.label}>WORD CATEGORIES</Text>
        <View style={s.chips}>
          {CATEGORIES.map((c) => {
            const on = settings.cats.includes(c);
            return (
              <Pressable key={c} onPress={() => { tap(); update({ cats: on ? settings.cats.filter((x) => x !== c) : [...settings.cats, c] }); }}
                style={[s.cat, on && s.catOn]} accessibilityState={{ selected: on }}>
                <Text style={[s.catText, on && s.catTextOn]}>{c}{c !== 'Custom' ? `  ${WORDS[c].length}` : ''}</Text>
              </Pressable>
            );
          })}
        </View>
        {settings.cats.includes('Custom') ? (
          <View style={s.setting}>
            <Text style={s.strong}>Your own words</Text>
            <TextInput multiline value={settings.custom} onChangeText={(t) => update({ custom: t })}
              placeholder={'One pair per line, e.g.\nShah Rukh, Salman\nGoa, Kerala'} placeholderTextColor={C.muted}
              style={[s.input, { minHeight: 90, textAlignVertical: 'top' }]} />
            <Text style={s.hint}>Write "word, similar word". A single word works too in "No word" mode. {customCount} added.</Text>
          </View>
        ) : null}
      </View>

      {error ? <Text style={s.error}>{error}</Text> : null}
      <Btn s={s} variant="red" title="Deal the words" onPress={onStart} />

      {hasScores ? (
        <View style={s.panel}>
          <View style={s.rowBetween}>
            <Text style={s.label}>SCOREBOARD</Text>
            <LinkBtn s={s} title="Reset scores" onPress={onResetScores} />
          </View>
          <ScoreTable s={s} players={players} scores={scores} />
        </View>
      ) : null}

      <View style={s.panel}>
        <Text style={s.label}>HOW TO PLAY</Text>
        {[
          'Pass the phone around. Each player presses and holds the card to see their secret word, then hands it on.',
          'Everyone has the same word except the imposter.',
          'Going in the order shown, each person says one word related to their secret word. Go round twice.',
          'Discuss, then point at the person you suspect. The player with the most votes is accused.',
          'Catch the imposter: every crew member scores 1, unless the imposter then guesses the word, which earns them 2. Imposter escapes: each imposter scores 3.',
        ].map((t, i) => <Text key={i} style={s.muted}>{i + 1}. {t}</Text>)}
      </View>
    </ScrollView>
  );
}

/* ---------- Pass ---------- */
function Pass({ s, players, round, setScreen, quitRound }) {
  const name = players[round.revealIdx];
  return (
    <View style={s.stage}>
      <Progress s={s} total={players.length} idx={round.revealIdx} />
      <Text style={[s.label, s.center]}>HAND THE PHONE TO</Text>
      <Text style={s.bigName}>{name}</Text>
      <Text style={[s.muted, s.center]}>Everyone else, look away.</Text>
      <Btn s={s} title={`I'm ${name}, show my word`} onPress={() => setScreen('reveal')} />
      <LinkBtn s={s} title="End round and go back to setup" onPress={quitRound} />
    </View>
  );
}

/* ---------- Reveal ---------- */
function Reveal({ s, players, settings, round, setRound, setScreen }) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(false);
  const i = round.revealIdx;
  const last = i === players.length - 1;
  const isImp = round.imposters.includes(i);

  let title = 'Your word', word = round.word, note = null, redCard = false;
  // The imposter always gets the category as a hint when they have no word.
  let showCat = settings.hint;
  if (isImp && settings.mode === 'blank') {
    title = 'You are the'; word = 'Imposter'; redCard = true; showCat = true;
    note = 'Use the category hint, listen to the clues, and blend in.';
  } else if (isImp && settings.mode === 'similar') {
    word = round.alt;
    if (settings.knows) { title = "You're the imposter. Your decoy word"; redCard = true; note = 'Everyone else has a different, related word.'; }
  }

  const onOpen = () => {
    setOpen(true); setSeen(true);
    if (redCard) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Vibration.vibrate([0, 120, 80, 120]);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
  };

  return (
    <View style={s.stage}>
      <Progress s={s} total={players.length} idx={i} />
      <Text style={[s.label, s.center]}>{players[i].toUpperCase()}'S SECRET</Text>
      <Pressable
        onPressIn={onOpen}
        onPressOut={() => setOpen(false)}
        delayLongPress={100000}
        accessibilityRole="button" accessibilityLabel="Press and hold to see your word"
        style={[s.card, open && s.cardOpen, open && redCard && s.cardImp]}>
        {open && redCard ? (
          <View style={s.face}>
            <View style={s.impBadge}><Text style={s.impBadgeText}>!</Text></View>
            <Text style={[s.impLabel, s.center]}>{title.toUpperCase()}</Text>
            <Text style={s.impSecret}>{word}</Text>
            {showCat ? (
              <View style={s.impHint}>
                <Text style={s.impHintLabel}>YOUR HINT · CATEGORY</Text>
                <Text style={s.impHintText}>{round.cat}</Text>
              </View>
            ) : null}
            {note ? <Text style={[s.impNote, s.center]}>{note}</Text> : null}
          </View>
        ) : open ? (
          <View style={s.face}>
            <Text style={[s.label, s.center]}>{title.toUpperCase()}</Text>
            <Text style={s.secret}>{word}</Text>
            {showCat ? <Text style={[s.label, s.center]}>CATEGORY · {round.cat.toUpperCase()}</Text> : null}
            {note ? <Text style={[s.hint, s.center]}>{note}</Text> : null}
          </View>
        ) : (
          <View style={s.face}>
            <View style={s.seal}><Text style={s.sealText}>HOLD</Text></View>
            <Text style={s.sealLabel}>PRESS & HOLD</Text>
          </View>
        )}
      </Pressable>
      <Text style={[s.muted, s.center]}>Press and hold the card. Let go to hide it.</Text>
      <Btn s={s} disabled={!seen} title={last ? "Everyone's seen their word" : `Done, pass to ${players[i + 1]}`}
        onPress={() => {
          if (last) { setRound({ ...round }); setScreen('clues'); }
          else { setRound({ ...round, revealIdx: i + 1 }); setScreen('pass'); }
        }} />
    </View>
  );
}

/* ---------- Clues ---------- */
function Clues({ s, players, settings, round, setScreen, quitRound }) {
  const [left, setLeft] = useState(settings.timer);
  const [running, setRunning] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!running) return;
    ref.current = setInterval(() => {
      setLeft((t) => {
        if (t <= 1) {
          clearInterval(ref.current); setRunning(false);
          Vibration.vibrate([0, 400, 150, 400]);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(ref.current);
  }, [running]);

  const toggleLabel = running ? 'Pause' : left === 0 ? "Time's up" : left === settings.timer ? 'Start timer' : 'Resume';

  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <Header s={s} sub={settings.hint ? `CATEGORY · ${round.cat.toUpperCase()}` : 'CLUE ROUND'} />
      <View style={s.panel}>
        <Text style={s.label}>CLUE ORDER</Text>
        <Text style={s.h2}>{players[round.order[0]]} starts</Text>
        <Text style={s.muted}>Each player says one word linked to their secret word. Go round twice. Don't say the word itself.</Text>
        <View style={{ gap: 6 }}>
          {round.order.map((idx, k) => (
            <View key={idx} style={s.orderRow}>
              <View style={[s.orderNum, k === 0 && s.orderNumFirst]}><Text style={[s.orderNumText, k === 0 && { color: '#fff' }]}>{k + 1}</Text></View>
              <Text style={s.strong}>{players[idx]}</Text>
            </View>
          ))}
        </View>
      </View>
      {settings.timer ? (
        <View style={s.panel}>
          <Text style={s.label}>DISCUSSION</Text>
          <Text style={[s.timer, left <= 10 && s.timerLow]}>{fmt(left)}</Text>
          <View style={s.btnRow}>
            <View style={{ flex: 1 }}><Btn s={s} variant="ghost" title={toggleLabel} disabled={left === 0} onPress={() => setRunning((r) => !r)} /></View>
            <View style={{ flex: 1 }}><Btn s={s} variant="ghost" title="Reset" onPress={() => { setRunning(false); setLeft(settings.timer); }} /></View>
          </View>
        </View>
      ) : null}
      <Btn s={s} variant="red" title="Time to vote" onPress={() => { setRunning(false); setScreen('vote'); }} />
      <LinkBtn s={s} title="End round and go back to setup" onPress={quitRound} />
    </ScrollView>
  );
}

/* ---------- Vote ---------- */
function Vote({ s, players, round, setRound, setScreen }) {
  const acc = round.accused;
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <Header s={s} sub="VOTE" />
      <View style={s.panel}>
        <Text style={s.h2}>Who's the imposter?</Text>
        <Text style={s.muted}>On the count of three, everyone points at a suspect. Tap the player with the most votes. Tied? Talk it out and vote again between them.</Text>
        <View style={s.voteGrid}>
          {players.map((p, i) => (
            <Pressable key={p} onPress={() => { tap(); setRound({ ...round, accused: i }); }}
              style={[s.voteBtn, acc === i && s.voteOn]} accessibilityState={{ selected: acc === i }}>
              <Text style={s.voteText}>{p}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Btn s={s} variant="red" disabled={acc == null} title={acc == null ? 'Pick a player to accuse' : `Accuse ${players[acc]}`}
        onPress={() => setScreen('result')} />
      <LinkBtn s={s} title="Back to clues" onPress={() => setScreen('clues')} />
    </ScrollView>
  );
}

/* ---------- Result ---------- */
function Result({ s, players, settings, round, scores, onGuess, onFinish, onAgain, quitRound }) {
  const accName = players[round.accused];
  const caught = round.imposters.includes(round.accused);
  const impNames = round.imposters.map((i) => players[i]);
  const others = impNames.filter((n) => n !== accName);
  const needGuess = caught && round.deltas == null;

  // Not caught: score immediately
  useEffect(() => { if (!caught && round.deltas == null) onFinish(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const altLabel = settings.mode === 'similar' ? "IMPOSTER'S WORD" : 'CATEGORY';
  const altVal = settings.mode === 'similar' ? round.alt : round.cat;

  let sub = '';
  if (impNames.length > 1) sub = `The imposters were ${impNames.join(' and ')}.`;
  else if (!caught) sub = `The imposter was ${impNames[0]}.`;
  if (caught && others.length) sub += ` ${others.join(' and ')} got away.`;

  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <Header s={s} sub="THE REVEAL" />
      <View style={[s.panel, { alignItems: 'center' }]}>
        <View style={[s.stamp, { borderColor: caught ? s.goodColor : s.accentColor }]}>
          <Text style={[s.stampText, { color: caught ? s.goodColor : s.accentColor }]}>{caught ? 'IMPOSTER CAUGHT' : 'IMPOSTER ESCAPED'}</Text>
        </View>
        <Text style={[s.h2, s.center]}>{accName} {caught ? 'was an imposter' : 'was innocent'}</Text>
        {sub ? <Text style={[s.muted, s.center]}>{sub}</Text> : null}
      </View>

      {needGuess ? (
        <View style={s.panel}>
          <Text style={s.label}>LAST CHANCE</Text>
          <Text style={s.h2}>{accName}, guess the word</Text>
          <Text style={s.muted}>Say your guess out loud. Then the group decides. The word stays hidden until you choose.</Text>
          <View style={s.btnRow}>
            <View style={{ flex: 1 }}><Btn s={s} title="They got it" onPress={() => onGuess(true)} /></View>
            <View style={{ flex: 1 }}><Btn s={s} variant="ghost" title="Wrong guess" onPress={() => onGuess(false)} /></View>
          </View>
        </View>
      ) : round.deltas ? (
        <>
          <View style={s.panel}>
            <View style={s.btnRow}>
              <View style={s.wordBox}><Text style={s.label}>CREW WORD</Text><Text style={s.wordBig}>{round.word}</Text></View>
              <View style={s.wordBox}><Text style={s.label}>{altLabel}</Text><Text style={s.wordBig}>{altVal}</Text></View>
            </View>
            <Text style={s.muted}>{caught
              ? (round.guessed ? `${accName} guessed the word and steals 2 points.` : `${accName} couldn't guess it. Crew scores 1 point each.`)
              : 'Each imposter scores 3 points.'}</Text>
          </View>
          <View style={s.panel}>
            <Text style={s.label}>SCOREBOARD</Text>
            <ScoreTable s={s} players={players} scores={scores} deltas={round.deltas} imposters={impNames} />
          </View>
          <Btn s={s} variant="red" title="Next round" onPress={onAgain} />
          <Btn s={s} variant="ghost" title="Change players or rules" onPress={quitRound} />
        </>
      ) : null}
    </ScrollView>
  );
}

function ScoreTable({ s, players, scores, deltas = {}, imposters = [] }) {
  const rows = players.map((p) => [p, scores[p] || 0]).sort((a, b) => b[1] - a[1]);
  const top = rows.length ? rows[0][1] : 0;
  return (
    <View>
      {rows.map(([p, v]) => (
        <View key={p} style={s.scoreRow}>
          <View style={s.scoreName}>
            <Text style={[s.body, v === top && top > 0 && { fontWeight: '700' }]}>{p}</Text>
            {imposters.includes(p) ? <View style={s.tag}><Text style={s.tagText}>IMPOSTER</Text></View> : null}
          </View>
          <Text style={s.scoreVal}>{v}{deltas[p] ? <Text style={s.delta}>  +{deltas[p]}</Text> : null}</Text>
        </View>
      ))}
    </View>
  );
}

/* ---------- Styles ---------- */
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

function makeStyles(C) {
  const st = StyleSheet.create({
    fill: { flex: 1 },
    scroll: { padding: 16, paddingBottom: 40, gap: 16, maxWidth: 560, width: '100%', alignSelf: 'center' },
    stage: { flex: 1, padding: 16, gap: 20, justifyContent: 'center', maxWidth: 560, width: '100%', alignSelf: 'center' },
    center: { textAlign: 'center' },
    brand: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
    tape: { backgroundColor: C.accent, paddingHorizontal: 8, paddingVertical: 4, transform: [{ rotate: '-2deg' }] },
    tapeText: { color: C.accentInk, fontFamily: MONO, fontSize: 11, letterSpacing: 1.5 },
    h1: { color: C.ink, fontSize: 44, fontWeight: '900', letterSpacing: -0.5 },
    h2: { color: C.ink, fontSize: 28, fontWeight: '900', lineHeight: 32 },
    label: { color: C.muted, fontFamily: MONO, fontSize: 11, letterSpacing: 1.5 },
    muted: { color: C.muted, fontSize: 15, lineHeight: 22 },
    hint: { color: C.muted, fontSize: 13, lineHeight: 19 },
    strong: { color: C.ink, fontSize: 16, fontWeight: '600' },
    body: { color: C.ink, fontSize: 16 },
    error: { color: C.accent, fontSize: 15 },
    panel: { backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 18, gap: 14 },
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
    setting: { gap: 8 },

    btn: { backgroundColor: C.ink, paddingVertical: 15, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center' },
    btnText: { color: C.bg, fontSize: 17, fontWeight: '700' },
    btnRed: { backgroundColor: C.accent, paddingVertical: 15, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center' },
    btnRedText: { color: C.accentInk, fontSize: 17, fontWeight: '700' },
    btnGhost: { borderColor: C.line, borderWidth: 1.5, paddingVertical: 14, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center' },
    btnGhostText: { color: C.ink, fontSize: 17, fontWeight: '600' },
    btnRow: { flexDirection: 'row', gap: 10 },
    link: { alignSelf: 'center', padding: 6 },
    linkText: { color: C.muted, textDecorationLine: 'underline', fontSize: 14 },

    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderColor: C.line, borderWidth: 1.5, borderRadius: 999, paddingLeft: 12, paddingRight: 4, paddingVertical: 4, gap: 4 },
    chipText: { color: C.ink, fontWeight: '500', fontSize: 15 },
    chipX: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    chipXText: { color: C.muted, fontSize: 18, lineHeight: 20 },
    addRow: { flexDirection: 'row', gap: 8 },
    addBtn: { backgroundColor: C.ink, borderRadius: 10, paddingHorizontal: 18, justifyContent: 'center' },
    input: { color: C.ink, backgroundColor: C.bg, borderColor: C.line, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16 },

    seg: { flexDirection: 'row', backgroundColor: C.bg, borderColor: C.line, borderWidth: 1.5, borderRadius: 10, padding: 3, gap: 3 },
    segBtn: { flex: 1, paddingVertical: 9, borderRadius: 7, alignItems: 'center' },
    segOn: { backgroundColor: C.surface, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
    segText: { color: C.muted, fontWeight: '600', fontSize: 14 },
    segTextOn: { color: C.ink },
    toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    switch: { width: 50, height: 30, borderRadius: 15, backgroundColor: C.line, padding: 3 },
    switchOn: { backgroundColor: C.good },
    knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.surface },
    knobOn: { transform: [{ translateX: 20 }] },

    cat: { backgroundColor: C.bg, borderColor: C.line, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
    catOn: { backgroundColor: C.crew, borderColor: C.crew },
    catText: { color: C.muted, fontWeight: '500', fontSize: 14 },
    catTextOn: { color: '#fff' },

    progress: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 5 },
    dot: { width: 22, height: 6, borderRadius: 3, backgroundColor: C.line },
    dotDone: { backgroundColor: C.ink },
    dotNow: { backgroundColor: C.crew },
    bigName: { color: C.crew, fontSize: 56, fontWeight: '900', textAlign: 'center', lineHeight: 60 },

    card: { width: '100%', maxWidth: 340, aspectRatio: 3 / 4, alignSelf: 'center', borderRadius: 22, backgroundColor: C.sealed, alignItems: 'center', justifyContent: 'center', padding: 24, borderWidth: 2, borderColor: C.sealed, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
    cardOpen: { backgroundColor: C.surface, borderColor: C.crew },
    cardImp: { backgroundColor: C.accent, borderColor: C.accent, shadowColor: C.accent, shadowOpacity: 0.55, shadowRadius: 24 },
    impBadge: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
    impBadgeText: { color: '#FFFFFF', fontSize: 38, fontWeight: '900', lineHeight: 42 },
    impLabel: { color: '#FFFFFF', opacity: 0.85, fontFamily: MONO, fontSize: 12, letterSpacing: 2 },
    impSecret: { color: '#FFFFFF', fontSize: 46, fontWeight: '900', textAlign: 'center', lineHeight: 50, textTransform: 'uppercase', letterSpacing: 1 },
    impHint: { backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', gap: 2 },
    impHintLabel: { color: '#FFFFFF', opacity: 0.8, fontFamily: MONO, fontSize: 10, letterSpacing: 1.5 },
    impHintText: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
    impNote: { color: '#FFFFFF', opacity: 0.9, fontSize: 14, lineHeight: 20, maxWidth: 240 },
    face: { alignItems: 'center', gap: 12 },
    seal: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderStyle: 'dashed', borderColor: C.sealedInk, alignItems: 'center', justifyContent: 'center' },
    sealText: { color: C.sealedInk, fontFamily: MONO, fontSize: 12, letterSpacing: 1.5 },
    sealLabel: { color: C.sealedInk, opacity: 0.7, fontFamily: MONO, fontSize: 11, letterSpacing: 1.5 },
    secret: { color: C.ink, fontSize: 42, fontWeight: '900', textAlign: 'center', lineHeight: 46 },
    secretImp: { color: C.accent },

    orderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.bg, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10 },
    orderNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.line, alignItems: 'center', justifyContent: 'center' },
    orderNumFirst: { backgroundColor: C.crew },
    orderNumText: { color: C.ink, fontFamily: MONO, fontSize: 12 },
    timer: { color: C.ink, fontFamily: MONO, fontSize: 64, textAlign: 'center', fontVariant: ['tabular-nums'] },
    timerLow: { color: C.accent },

    voteGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    voteBtn: { flexGrow: 1, flexBasis: '45%', backgroundColor: C.bg, borderColor: C.line, borderWidth: 2, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 10, alignItems: 'center' },
    voteOn: { borderColor: C.accent, backgroundColor: C.surface },
    voteText: { color: C.ink, fontWeight: '600', fontSize: 17, textAlign: 'center' },

    stamp: { borderWidth: 2, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6, transform: [{ rotate: '-3deg' }] },
    stampText: { fontFamily: MONO, fontSize: 12, letterSpacing: 2 },
    wordBox: { flex: 1, backgroundColor: C.bg, borderRadius: 10, padding: 12, gap: 2 },
    wordBig: { color: C.ink, fontSize: 22, fontWeight: '800' },
    scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.line },
    scoreName: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
    scoreVal: { color: C.ink, fontFamily: MONO, fontSize: 15 },
    delta: { color: C.good, fontSize: 13 },
    tag: { backgroundColor: C.accent, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
    tagText: { color: C.accentInk, fontFamily: MONO, fontSize: 10, letterSpacing: 1 },
  });
  return { ...st, goodColor: C.good, accentColor: C.accent };
}
