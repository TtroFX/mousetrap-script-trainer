// Physical PDF page mapping for The Mousetrap script.
// Source authority: "The Mousetrap 台本.pdf"
// SHA-256: 94d46d2afe7504d2010c10b3ef4f1017bc3adfe0c09ab86bfd837167357c397b
// A speech is mapped to the physical PDF page on which its speaker label begins.
// UI page numbers exclude the cover, so the displayed page is physical PDF page - 1.
const PDF_PAGE_BOUNDARIES = Object.freeze({
  'act1-scene1': [[1,3],[3,4],[15,5],[33,6],[43,7],[51,8],[61,9],[72,10],[85,11],[99,12],[114,13],[123,14],[133,15],[150,16],[158,17],[174,18],[187,19]],
  'act1-scene2': [[1,20],[14,21],[30,22],[48,23],[66,24],[79,25],[95,26],[109,27],[125,28],[138,29],[150,30],[168,31],[183,32],[194,33],[208,34],[222,35],[233,36],[245,37],[260,38],[275,39],[295,40],[310,41],[327,42],[336,43]],
  'act2': [[1,44],[13,45],[25,46],[42,47],[60,48],[79,49],[93,50],[102,51],[115,52],[133,53],[148,54],[166,55],[180,56],[202,57],[219,58],[239,59],[250,60],[272,61],[287,62],[309,63],[327,64],[346,65],[368,66],[373,67],[379,68],[394,69],[416,70],[433,71],[457,72],[479,73],[499,74],[510,75],[520,76],[539,77],[556,78],[566,79],[574,80],[588,81],[599,82],[614,83],[628,84]],
});
const SPEECH_COUNTS = Object.freeze({'act1-scene1':190,'act1-scene2':336,'act2':638});

export function pageForLine(lineId) {
  const match = /^(act1-scene1|act1-scene2|act2)-speech-(\d{4})$/.exec(String(lineId || ''));
  if (!match) return null;
  const ordinal = Number(match[2]);
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > SPEECH_COUNTS[match[1]]) return null;
  let page = null;
  for (const [start, candidate] of PDF_PAGE_BOUNDARIES[match[1]]) {
    if (ordinal < start) break;
    page = candidate;
  }
  return Number.isInteger(page) ? page - 1 : null;
}
