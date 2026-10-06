import { expect,test } from 'bun:test'
import { evaluateExpression as evaluate,type BaseRow } from '../base-expression'
import { BaseDuration,BaseLink } from '../base-values'
import { baseEmbeds } from '../base-embed'
const row:BaseRow={path:'Books/one.md',properties:{},file:{path:'Books/one.md',name:'one.md',basename:'one',folder:'Books',ext:'md',tags:['books/fiction'],properties:{author:'A'},links:[new BaseLink('two.md')]}}
const other:BaseRow={path:'two.md',properties:{},file:{path:'two.md',name:'two.md',ext:'md',links:[new BaseLink('Books/one.md')]}}
row.resolve=p=>p==='two'||p==='two.md'?other:p==='one'||p===row.path?row:undefined
const run=(s:string)=>evaluate(s,{row})
test('documented scalar and list examples including implicit lambda scopes',()=>{
 const cases:Record<string,unknown>={
  'if(false, 1)':null,'if(true, 5, 1/0)':5,'list("v")':['v'],'list([1,2])':[1,2],
  'number("3.4")':3.4,'number(true)':1,'1.isTruthy()':true,'123.toString()':'123','5.isEmpty()':false,
  '"hello".containsAll("h","e")':true,'"hello".containsAny("x","e")':true,'"hello".endsWith("lo")':true,
  '"".isEmpty()':true,'"HI".lower()':'hi','" hello ".trim()':'hello','"hello world".title()':'Hello World',
  '"123".repeat(2)':'123123','"hello".reverse()':'olleh','"hello".slice(1,4)':'ell',
  '"a,b,c,d".split(/,/,3)':['a','b','c'],'"a:b:c".replace(/:/,"-")':'a-b:c','"a:b:c".replace(/:/g,"-")':'a-b-c',
  '"John Smith".replace(/(\\w+) (\\w+)/,"$2, $1")':'Smith, John',
  '(-5).abs()':5,'(2.1).ceil()':3,'(2.9).floor()':2,'(2.3333).round(2)':2.33,'(3.14159).toFixed(2)':'3.14',
  '[1,2,3].contains(2)':true,'[1,2,3].containsAll(2,3)':true,'[1,2,3].containsAny(3,4)':true,
  '[1,2,3,4].filter(value>2)':[3,4],'[1,[2,3]].flat()':[1,2,3],'[1,2,3].join(",")':'1,2,3',
  '[1,2,3].map(value+index)':[1,3,5],'[1,2,3].reduce(acc+value,0)':6,
  '[[1,2],[3]].map(value.map(value * 2))':[[2,4],[6]],'[1,2,3].reverse()':[3,2,1],
  '[1,2,3,4].slice(1,3)':[2,3],'[3,1,2].sort()':[1,2,3],'[1,2,2,3].unique()':[1,2,3],
  '({a:1,b:2}).keys()':['a','b'],'({a:1,b:2}).values()':[1,2],'({}).isEmpty()':true,
  '/abc/i.matches("ABC")':true,'escapeHTML("<b>&")':'&lt;b&gt;&amp;',
 }
 for(const [formula,expected] of Object.entries(cases)) expect(run(formula),formula).toEqual(expected)
 expect(()=>run('number("invalid")')).toThrow()
})
test('calendar date clipping, Moment formatting, date fields and typed duration',()=>{
 expect(run('(date("2025-01-31") + "1M").format("YYYY-MM-DD")')).toBe('2025-02-28')
 expect(run('(date("2025-01-01") + duration("5h") * 2).time()')).toBe('10:00:00')
 expect(run('date("2025-05-27 12:34:56").format("[Day:] dddd, MMMM Do")')).toBe('Day: Tuesday, May 27th')
 expect(run('date("2025-05-27 12:34:56").hour')).toBe(12)
 expect(run('duration("1d") * 2')).toBeInstanceOf(BaseDuration)
 expect(run('date("2025-01-01").isEmpty()')).toBe(false)
 expect(()=>run('date("nonsense")')).toThrow()
})
test('typed links resolve through file(), equality, predicates and backlinks',()=>{
 expect(run('file("two").name')).toBe('two.md')
 expect(run('file.asLink().asFile().path')).toBe(row.path)
 expect(run('link("one") == file')).toBe(true)
 expect(run('link("two").linksTo(file)')).toBe(true)
 expect(run('file.hasLink("two")')).toBe(true)
 expect(run('file.hasTag("books")')).toBe(true)
 expect(run('file.inFolder("Books")')).toBe(true)
 expect(run('file.file.name')).toBe('one.md')
 expect(run('link("missing").asFile()')).toBeNull()
})
test('regex/object expressions cannot escape interpreter limits',()=>{
 for(const source of ['({"__proto__":1})','({x:1}).constructor','/(a+)+$/.matches("aaaa")','"x".repeat(1000001)','file["constructor"]("return process")()']) expect(()=>run(source)).toThrow()
})
test('embed scanning preserves offsets and ignores examples inside other code fences',()=>{
 const source='# Header\r\n![[Books.base#Cards]]\r\n\r\n```base\r\nviews: [{type: table, name: Table}]\r\n```\r\n```text\r\n![[ignored.base]]\r\n```\r\n'
 const embeds=baseEmbeds(source)
 expect(embeds).toHaveLength(2)
 expect(embeds[0].target).toBe('Books.base#Cards')
 expect(embeds[1].source).toBe('views: [{type: table, name: Table}]\r\n')
 expect(source.slice(embeds[1].start,embeds[1].end)).toStartWith('```base\r\n')
})

test('clipboard TSV preserves quoted tabs and newlines',async()=>{
 const {parseTSV,encodeTSV}=await import('../tabular')
 const cells=[['a\tb','multi\nline','"quoted"'],['1','2','3']]
 expect(parseTSV(encodeTSV(cells))).toEqual(cells)
 expect(parseTSV('1\t2\r\n3\t4\r\n')).toEqual([['1','2'],['3','4']])
})
