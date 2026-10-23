/** 앞쪽부터 정렬된 요소로 레이어 목록을 만든다. 필기 데이터 자체는 변경하지 않는다. */
export function buildLayerRows(layers, collapsed) {
  const rows = []
  let groupNo = 0
  for (let i = 0; i < layers.length;) {
    const object = layers[i]
    if (!object.groupId) {
      if (object.type !== 'stroke') rows.push({ kind: 'object', object })
      i += 1
      continue
    }
    let end = i
    while (end < layers.length && layers[end].groupId === object.groupId) end += 1
    const members = layers.slice(i, end)
    const visible = members.filter(member => member.type !== 'stroke')
    if (visible.length) {
      groupNo += 1
      // 혼합 그룹을 선택·이동·잠금할 때는 숨긴 획도 기존 그룹 멤버로 유지한다.
      rows.push({ kind: 'group', groupId: object.groupId, members, name: object.groupName ?? `그룹 ${groupNo}` })
      if (!collapsed.has(object.groupId)) visible.forEach(member => rows.push({ kind: 'object', object: member, nested: true }))
    }
    i = end
  }
  return rows
}
