import VueQrCode from 'vue-qrcode';

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.component('qr-code', VueQrCode);
});
