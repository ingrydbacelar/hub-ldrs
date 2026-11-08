// Animação de entrada dos módulos
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.module').forEach((el, i) => {
    setTimeout(() => el.classList.add('is-visible'), 120 * i);
  });
});
