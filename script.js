// Interactive bits of the page live here.

// ---------- Project slider ----------
// The arrows move the row of project cards one card at a time.
// How many cards fit at once comes from --per-view in style.css.
const slider = document.querySelector('.slider');

if (slider) {
  const viewport = slider.querySelector('.slider-viewport');
  const track = slider.querySelector('.project-grid');
  const cards = Array.from(track.children);
  const prevButton = slider.querySelector('.slider-arrow.prev');
  const nextButton = slider.querySelector('.slider-arrow.next');
  let index = 0;

  function cardsPerView() {
    return parseInt(getComputedStyle(track).getPropertyValue('--per-view'), 10) || 1;
  }

  function lastIndex() {
    return Math.max(0, cards.length - cardsPerView());
  }

  function update() {
    index = Math.min(Math.max(index, 0), lastIndex());
    const offset = cards[index].offsetLeft - cards[0].offsetLeft;
    track.style.transform = `translateX(${-offset}px)`;
    prevButton.disabled = index === 0;
    nextButton.disabled = index === lastIndex();
  }

  prevButton.addEventListener('click', () => {
    index -= 1;
    update();
  });

  nextButton.addEventListener('click', () => {
    index += 1;
    update();
  });

  // Tabbing to a card that's out of view slides it in, instead of letting
  // the browser scroll the hidden overflow and knock the row out of line.
  track.addEventListener('focusin', (event) => {
    const card = event.target.closest('.project-card');
    const cardIndex = cards.indexOf(card);
    viewport.scrollLeft = 0;
    if (cardIndex < index) index = cardIndex;
    if (cardIndex >= index + cardsPerView()) index = cardIndex - cardsPerView() + 1;
    update();
  });

  window.addEventListener('resize', update);
  update();
}
