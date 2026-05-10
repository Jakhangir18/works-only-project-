function r() {
  document.querySelectorAll("#js-back, #js-back-footer").forEach(e => {
    e.addEventListener("click", o => {
      o.preventDefault();
      sessionStorage.setItem("returnToWorks", "1");
      window.location.href = "/";
    });
  });
}

r();

const c = document.querySelectorAll(".ams-animate");

const s = new IntersectionObserver(t => {
  t.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add("is-visible");
      s.unobserve(e.target);
    }
  });
}, {
  threshold: .08,
  rootMargin: "0px 0px -50px 0px"
});

c.forEach(t => s.observe(t));
