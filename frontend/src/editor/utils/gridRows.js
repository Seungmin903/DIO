// 673: 격자 목록의 마지막 줄을 빈 칸으로 채워 모든 칸 폭을 같게 한다(flex 1 칸이 남는 폭을 나눠 가져 마지막 줄만 넓어지지 않게)
export const padRows = (rows,columns)=>rows.length%columns?[...rows,...Array.from({length:columns-rows.length%columns},(_,i)=>({__filler:i}))]:rows
