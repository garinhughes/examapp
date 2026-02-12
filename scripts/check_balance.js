const fs = require('fs');
const s = fs.readFileSync('/home/garin/github/examapp/frontend/src/App.tsx','utf8');
const pairs = {'(':')','[':']','{':'}'};
const stack = [];
for(let i=0;i<s.length;i++){
  const c = s[i];
  if ('([{'.includes(c)) stack.push({c,i});
  else if (')]}'.includes(c)){
    const last = stack.pop();
    if (!last || pairs[last.c] !== c){
      console.log('Mismatch at', i, c, 'expected', last ? pairs[last.c] : 'none');
      process.exit(1);
    }
  }
}
if (stack.length){
  const last = stack[stack.length-1];
  const prefix = s.slice(Math.max(0,last.i-40), last.i+40);
  console.log('Unclosed', last, 'context:\n' + prefix);
  process.exit(2);
}
console.log('All balanced');
