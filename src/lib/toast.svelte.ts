let message = $state('');
let timer: ReturnType<typeof setTimeout>;
export const toast = {
  get message() { return message; },
  show(m: string) {
    message = m;
    clearTimeout(timer);
    timer = setTimeout(() => (message = ''), 2600);
  }
};
