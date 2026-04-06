const fs = require('fs');
const env = fs.readFileSync('c:/Users/Shivm/Downloads/pp-2/paper-to-practise-main/.env', 'utf8');
const lines = env.split('\n');
let url = '', key = '';
lines.forEach(l => {
  if (l.startsWith('VITE_SUPABASE_URL=')) url = l.split('=')[1].trim().replace(/"/g, '');
  if (l.startsWith('VITE_SUPABASE_ANON_KEY=')) key = l.split('=')[1].trim().replace(/"/g, '');
});

(async () => {
    // get profiles
    const profRes = await fetch(url + '/rest/v1/profiles?select=id,username,full_name', {
        headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
    });
    const profiles = await profRes.json();
    const pMap = {}; profiles.forEach(p => pMap[p.id] = p.full_name || p.username);

    // get exams
    const examsRes = await fetch(url + '/rest/v1/exams?select=id,name', {
        headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
    });
    const exams = await examsRes.json();
    const eMap = {}; exams.forEach(e => eMap[e.id] = e.name);

    // get sections
    const secRes = await fetch(url + '/rest/v1/sections?select=id,exam_id,language,sort_order', {
        headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
    });
    const sections = await secRes.json();
    const sMap = {}; sections.forEach(s => sMap[s.id] = s);

    // get modern attempts
    const attRes = await fetch(url + '/rest/v1/attempts?select=id,user_id,section_id,score,total_questions,created_at&order=created_at.desc&limit=30', {
        headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
    });
    const attempts = await attRes.json();

    console.log('Latest 30 attempts:');
    attempts.forEach(a => {
        const u = pMap[a.user_id] || 'Unknown';
        if (!u.includes('123ffd') && !u.includes('sdf')) return;
        const s = sMap[a.section_id];
        const e = s ? eMap[s.exam_id] : null;
        console.log(`[${a.created_at}] User: ${u} | Exam: ${e} | lang: ${s?.language} | order: ${s?.sort_order} | score: ${a.score}/${a.total_questions}`);
    });
})();
