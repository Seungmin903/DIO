export function memberInviteId(url) {
  const match = typeof url === 'string' && /^dio:\/\/member-invites\/([1-9][0-9]{0,18})$/.exec(url);
  return match && match[0] === url && BigInt(match[1]) <= 9223372036854775807n ? match[1] : null;
}

export function subscribeMemberInviteLinks(linking, onInvite) {
  let active = true;
  let receivedLiveInvite = false;
  const subscription = linking.addEventListener('url', ({ url }) => {
    const id = memberInviteId(url);
    if (id && active) {
      receivedLiveInvite = true;
      onInvite(id);
    }
  });
  linking.getInitialURL().then(url => {
    const id = memberInviteId(url);
    if (active && !receivedLiveInvite && id) onInvite(id);
  }).catch(() => {});
  return () => {
    active = false;
    subscription.remove();
  };
}
