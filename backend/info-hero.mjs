// Original 32 × 24 pixel sprites, encoded as row runs rather than bitmap files.
// The small shared palette and integer grid keep a deliberately early-web look.
const palette = {x:'#51405f',w:'#fff4db',l:'#cab5dd',p:'#9273ad',y:'#e7b95f',r:'#cc829f',g:'#91b8a0',b:'#86a9c5'};
const art = rows => {
  const pixels = rows.flatMap((row,y) => {
    const runs = [];
    for (let x=0;x<row.length;) {
      const color = row[x]; let end=x+1;
      while (row[end] === color) end++;
      if (palette[color]) runs.push(`<rect x="${x}" y="${y}" width="${end-x}" height="1" fill="${palette[color]}"/>`);
      x=end;
    }
    return runs;
  }).join('');
  return `<svg class="info-art" viewBox="0 0 32 24" aria-hidden="true" focusable="false" shape-rendering="crispEdges"><g stroke="none">${pixels}</g></svg>`;
};
const drawings = {
  practice: art([
    '', '', '                     xx', '    xxxxxxxxxxxxx   xrrx',
    '    xwwwwwwwwwwwx  xrrrx', '    xwwwwwwwwwwwx xxyyx',
    '    xwwpppwwwwwwxxywyx', '    xwpwwwpwwwwwxywyx',
    '    xwpwwwpwwwwxywyx', '    xwwpwpwwwwxywyx',
    '    xwwpwpwwwxywyx', '    xwwppwwwxywyx',
    '    xwwwwwwxwwwx', '    xwwwwwxwwwxx',
    '    xwwwwwxxxxwwx', '    xwwwwwwwwwwwx',
    '    xwwrrwrrwrrwx', '    xwwwwwwwwwwwx',
    '    xxxxxxxxxxxxx', '     ppppppppppppp', '', '', '', '',
  ]),
  guide: art([
    '', '', '', '    xxxxxxxxx    xxxxxxxxx',
    '   xwwwwwwwwwxxxxwwwwwwwwwx', '   xwwwwwwwwwwxxwwwwwwwwwwx',
    '   xwwppppppwwxxwwbbbbbbwwx', '   xwwppppppwwxxwwbbbbbbwwx',
    '   xwwwwwwwwwwxxwwwwwwwwwwx', '   xwwppppwwwwxxwwbbbbwwwwx',
    '   xwwwwwwwwwwxxwwwwwwwwwwx', '   xwwrrwwrrwwxxwwwwggwwwwx',
    '   xwwrrwwrrwwxxwwwggggwwwx', '   xwwwwwwwwwwxxwwggggggwwx',
    '   xwwwwwwwwwwxxwwwggggwwwx', '   xwwppppppwwxxwwwwggwwwwx',
    '   xwwwwwwwwwwxxwwwwwwwwwwx', '   xxxxxxxxxwwxxwwxxxxxxxxx',
    '   xppppppppxxxxxxppppppppx', '    xxxxxxxxxxxxxxxxxxxxxx', '', '', '', '',
  ]),
  news: art([
    '', '', '                    xx', '                   xrx    yy',
    '                 xxrrx   yy', '               xxrrrrx',
    '             xxrrrrrrx', '      xxxxxxxrrrrrrrrx',
    '     xwwwwxrrrrrrrrrrx', '     xwwwwxrrrrrrrrrrx    yyyy',
    '     xllllxrrrrrrrrrrx    yyyy', '     xllllxrrrrrrrrrrx',
    '      xxxxxxxrrrrrrrrx', '        xywx xxrrrrrrx',
    '        xywx   xxrrrrx', '         xywx    xxrrx   yy',
    '         xywx      xrx    yy', '         xywx       xx',
    '          xxx', '', '', '', '', '',
  ]),
  about: art([
    '', '', '', '  xxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    '  xwwwwwwwwwwwwwwwwwwwwwwwwwlx', '  xwpwpwpppppppppppppppwxwxwlx',
    '  xwwwwwwwwwwwwwwwwwwwwwwwwwlx', '  xxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    '  xwwwwwwwwwwwwwwwwwwwwwwwwwlx', '  xwwwwrrwwrrwwwwppppppppwwwlx',
    '  xwwwrrrrrrrrwwwppppppppwwwlx', '  xwwwrrrrrrrrwwwwwwwwwwwwwwlx',
    '  xwwwwrrrrrrwwwwppppppwwwwwlx', '  xwwwwwrrrrwwwwwwwwwwwwwwwwlx',
    '  xwwwwwwrrwwwwwwppppppppwwwlx', '  xwwwwwwwwwwwwwwwwwwwwwwwwwlx',
    '  xwwwwwwwwwwwwwwpppppwwwwwwlx', '  xllllllllllllllllllllllllllx',
    '  xxxxxxxxxxxxxxxxxxxxxxxxxxxx', '   pppppppppppppppppppppppppppp', '', '', '', '',
  ]),
};
const tiles = [
  ['practice','free draw','A little room to experiment.'],
  ['guide','drawing guide','Find your next favorite mark.'],
  ['news','announcements','Notes from Michael.'],
  ['about','about the site','The story, the details, and a way to say hello.'],
];
const targets = {practice:'practice',guide:'drawing-guide',news:'announcements',about:'site-information'};
export const infoHero = `<nav class="info-links" aria-label="information sections">${tiles.map(([key,title,description]) => `<a class="info-tile info-tile--${key}" href="#${targets[key]}">${drawings[key]}<span class="info-tile-copy"><strong>${title}</strong><span>${description}</span></span><span class="info-tile-arrow" aria-hidden="true">↗</span></a>`).join('')}</nav>`;
