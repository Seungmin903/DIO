export async function signInWithGoogle(){throw new Error('구글 로그인은 Android·iOS DIO 앱에서 이용해 주세요.');}
// 웹에는 구글 로그인이 없어 끊을 연결도 없다.
export async function revokeGoogleAccess(_account){return false;}
