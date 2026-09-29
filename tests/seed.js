const now = Date.now();
const day = 86400000;
const iso = d => new Date(d).toISOString().slice(0, 10);

const entries = [
  { id: 'e1', date: iso(now), title: '프로젝트A', category: '개발', importance: '상', bullets: ['a1'], overview: '개요에만 있는 고유단어 zebra', problem: '', solution: '', lesson: '', tags: ['t1'], links: [], images: [], favorite: false, createdAt: now - 5, updatedAt: now - 5 },
  { id: 'e2', date: iso(now - day), title: '프로젝트B', category: '사내issue', importance: '중', bullets: ['b1'], overview: '', problem: 'p', solution: 's', lesson: '', tags: [], links: [], images: [], favorite: true, createdAt: now - 4, updatedAt: now - 4 },
  { id: 'e3', date: iso(now - 2 * day), title: '프로젝트C', category: '제안', importance: '하', bullets: ['c1'], overview: '', problem: '', solution: '', lesson: '', tags: [], links: [], images: [], favorite: false, createdAt: now - 3, updatedAt: now - 3 },
  { id: 'e4', date: iso(now - 3 * day), title: '프로젝트D', category: '개발', importance: '중', bullets: ['d1'], overview: '', problem: '', solution: '', lesson: '', tags: [], links: [], images: [], favorite: false, createdAt: now - 2, updatedAt: now - 2 },
  { id: 'e5', date: iso(now - 4 * day), title: '삭제된일지', category: '기타', importance: '중', bullets: [], overview: '', problem: '', solution: '', lesson: '', tags: [], links: [], images: [], favorite: false, deleted: true, deletedAt: now - 1, createdAt: now - 1, updatedAt: now - 1 },
];
const notes = [
  { id: 'n1', text: '노트 하나', imageRefs: [], processed: false, linkedEntryId: null, createdAt: now - 30, updatedAt: now - 30 },
  { id: 'n2', text: '노트 둘', imageRefs: [], processed: false, linkedEntryId: null, createdAt: now - 20, updatedAt: now - 20 },
  { id: 'n3', text: '노트 셋(정리됨)', imageRefs: [], processed: true, linkedEntryId: 'e1', createdAt: now - 10, updatedAt: now - 10 },
];
const todos = [
  { id: 't1', text: '할일 하나', due: null, done: false, createdAt: now - 3, updatedAt: now - 3 },
  { id: 't2', text: '할일 둘', due: null, done: false, createdAt: now - 2, updatedAt: now - 2 },
  { id: 't3', text: '할일 셋(완료)', due: null, done: true, completedAt: now - 1, createdAt: now - 1, updatedAt: now - 1 },
];
const seed = () => JSON.parse(JSON.stringify({
  'data/entries.json': entries, 'data/quick-notes.json': notes, 'data/todos.json': todos,
  'data/phrases.json': [], 'data/categories.json': [], 'data/memos.json': [],
}));
module.exports = { seed };
