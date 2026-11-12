export function memberInviteId(url) {
  const match = typeof url === 'string' && /^dio:\/\/member-invites\/([1-9][0-9]{0,18})$/.exec(url);
  return match && match[0] === url && BigInt(match[1]) <= 9223372036854775807n ? match[1] : null;
}

export function sharedInviteUrl(url) {
  const match = typeof url === 'string' && /^https:\/\/k15f106\.p\.ssafy\.io\/invite\/([1-9][0-9]{0,18})\.[A-Za-z0-9_-]{43}$/.exec(url);
  return match && match[0] === url && BigInt(match[1]) <= 9223372036854775807n ? url : null;
}

export function subscribeMemberInviteLinks(linking, onInvite, onSharedInvite) {
  let active = true;
  let receivedLiveInvite = false;
  const deliver = url => {
    const id = memberInviteId(url);
    if (id) {
      onInvite(id);
      return true;
    }
    const link = sharedInviteUrl(url);
    if (!link || !onSharedInvite) return false;
    onSharedInvite(link);
    return true;
  };
  const subscription = linking.addEventListener('url', ({ url }) => {
    if (active && deliver(url)) receivedLiveInvite = true;
  });
  linking.getInitialURL().then(url => {
    if (active && !receivedLiveInvite) deliver(url);
  }).catch(() => {});
  return () => {
    active = false;
    subscription.remove();
  };
}
