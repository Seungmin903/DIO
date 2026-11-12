import { createContext, useContext } from 'react';

// 폰의 알림 아이콘. 화면마다 제목 줄 오른쪽 끝에 놓인다(태블릿은 좌측 바에 있어 값이 없다).
const PhoneBellContext = createContext(null);

export const PhoneBellProvider = PhoneBellContext.Provider;

export default function PhoneBell() {
  return useContext(PhoneBellContext);
}
