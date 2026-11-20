/* KULLANIM REHBERİ: "Nasıl Kullanılır?" penceresi ve adım adım tur aynı listeden beslenir.
       Bir adım değişirse yalnızca VITA_GUIDE_STEPS güncellenir; pencere, tur ve ilerleme birlikte değişir. */
    const VITA_GUIDE_STEPS = [
      {
        id: "profile", view: "view-home", targets: ["#headerProfileButton"],
        title: "Profilinizi girin",
        text: "Yaş, boy, kilo ve kullandığınız ilaçlar.",
        detail: "Su hedefi, böbrek (eGFR) hesabı ve ilaç–takviye uyarıları bu bilgilere göre ayarlanır. Sağ üstteki adınıza dokunarak istediğiniz zaman değiştirebilirsiniz.",
        actionLabel: "Profili düzenle",
        open: () => openProfileModal(true),
        done: () => typeof isVitaProfileComplete === "function" && isVitaProfileComplete()
      },
      {
        id: "labs", view: "view-labs", targets: ["#guideLabsTarget"],
        title: "Tahlillerim",
        text: "e-Nabız PDF'ini yükleyin ya da değerleri elle yazın.",
        detail: "D vitamini, B12, ferritin, hemoglobin, kreatinin gibi değerler tarihi ve referans aralığıyla kaydedilir; yeni tahliller eskileriyle karşılaştırılır.",
        actionLabel: "Tahlil ekle",
        open: () => navigateToView("view-labs"),
        done: () => (Array.isArray(state.labHistory) && state.labHistory.length > 0)
          || Object.values(state.labValues || {}).some(value => value !== null && value !== undefined && value !== "")
      },
      {
        id: "symptoms", view: "view-neyim", targets: ["#guideNeyimTarget"],
        title: "NeyimVar?",
        text: "Yaşadığınız belirtileri seçin.",
        detail: "7 kısa adımda belirtilerinizi işaretleyin. Ağız, dil, cilt, saç ve tırnak belirtilerindeki (?) düğmesi örnek görsel açar.",
        actionLabel: "Belirti seç",
        open: () => navigateToView("view-neyim"),
        done: () => Boolean(state.selectedSymptoms && state.selectedSymptoms.size > 0)
      },
      {
        id: "analysis", view: "view-clinical-results",
        targets: ["#view-clinical-results h2", "#view-clinical-results h3", "#mobile-nav-view-clinical-results"],
        title: "Klinik Analiz",
        text: "Tahlil ve belirtileriniz birlikte yorumlanır.",
        detail: "Neye dikkat etmeli, hangi besinler ve hangi testler hekiminizle konuşulabilir; ilaç–takviye uyarıları da burada. Bu bir tanı değildir.",
        actionLabel: "Analize bak",
        open: () => navigateToView("view-clinical-results"),
        done: () => vitaGuideVisited("view-clinical-results")
      },
      {
        id: "daily", view: "view-home", targets: ["#guideDailyProtocolTarget", "#view-home h2"],
        title: "Günlük takip",
        text: "Bugünkü takviyelerinizi ve suyunuzu işaretleyin.",
        detail: "Hekiminizin önerdiği takviyeleri sabah, öğle ve akşam olarak ekleyin; barkod veya kutu fotoğrafıyla da eklenebilir. Liste ve su sayacı her gece 00:00'da yenilenir.",
        actionLabel: "Takviyelere git",
        open: () => navigateToView("view-home"),
        done: () => Array.isArray(state.supplements) && state.supplements.length > 0
      },
      {
        id: "report", view: "view-report", targets: ["#reportModeSelectorBar h2", "#btnPrintDoctorReport"],
        title: "Doktor Raporu",
        text: "Özetinizi yazdırın veya PDF olarak kaydedin.",
        detail: "Tahlil gidişatı, belirtiler ve uyarılar kısa bir raporda toplanır. Doktor görüşmesine yazdırıp götürebilir ya da PDF olarak kaydedebilirsiniz.",
        actionLabel: "Raporu aç",
        open: () => navigateToView("view-report"),
        done: () => vitaGuideVisited("view-report")
      }
    ];
    // Eski adla erişen tanılama testleri ve yardımcılar için takma ad.
    const VITA_SPOTLIGHT_STEPS = VITA_GUIDE_STEPS;

    let vitaSpotlightStepIndex = 0;
    let vitaSpotlightActive = false;
    let vitaSpotlightReturnView = null;
    let vitaSpotlightListeners = null;
    let vitaSpotlightTimers = [];

    /* İLERLEME: yalnızca kullanıcının kendi gezintisi sayılır; turun gösterdiği ekranlar sayılmaz. */
    function vitaGuideProgressKey() { return activeUserId ? `vitatakip_guide_progress_${activeUserId}` : null; }

    function readVitaGuideProgress() {
      const key = vitaGuideProgressKey();
      if (!key) return { visited: {} };
      try {
        const parsed = JSON.parse(safeLocalStorageGetItem(key) || "{}");
        return { visited: parsed && typeof parsed.visited === "object" && parsed.visited ? parsed.visited : {} };
      } catch (_) { return { visited: {} }; }
    }

    function vitaGuideVisited(viewId) { return Boolean(readVitaGuideProgress().visited[viewId]); }

    function markVitaGuideVisit(viewId) {
      if (vitaSpotlightActive || !activeUserId) return;
      if (viewId !== "view-clinical-results" && viewId !== "view-report") return;
      const progress = readVitaGuideProgress();
      if (progress.visited[viewId]) return;
      progress.visited[viewId] = true;
      safeLocalStorageSetItem(vitaGuideProgressKey(), JSON.stringify(progress));
    }

    function isVitaGuideStepDone(step) {
      try { return Boolean(step.done()); } catch (_) { return false; }
    }

    function getVitaGuideStatus() {
      const done = VITA_GUIDE_STEPS.map(isVitaGuideStepDone);
      const nextIndex = done.indexOf(false);
      return { done, count: done.filter(Boolean).length, total: VITA_GUIDE_STEPS.length, nextIndex };
    }

    function escapeVitaGuideText(value) {
      return String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
    }

    /* "NASIL KULLANILIR?" PENCERESİ */
    function renderVitaGuideModal() {
      const list = document.getElementById("vitaGuideSteps");
      if (!list) return;
      const status = getVitaGuideStatus();
      list.innerHTML = VITA_GUIDE_STEPS.map((step, index) => {
        const done = status.done[index];
        const isNext = index === status.nextIndex;
        const badge = done ? '<i class="fa-solid fa-check" aria-hidden="true"></i>' : String(index + 1);
        const tag = done ? '<small class="vg-tag vg-tag-done">Tamam</small>' : (isNext ? '<small class="vg-tag vg-tag-next">Sıradaki</small>' : "");
        return `<li class="${done ? "is-done" : ""}${isNext ? " is-next" : ""}"><button type="button" data-guide-step="${index}" aria-label="${index + 1}. adım: ${escapeVitaGuideText(step.title)}${done ? " (tamamlandı)" : ""}"><b>${badge}</b><span><strong>${escapeVitaGuideText(step.title)}${tag}</strong><em>${escapeVitaGuideText(step.text)}</em></span></button></li>`;
      }).join("");
      list.querySelectorAll("[data-guide-step]").forEach(button => {
        button.addEventListener("click", () => openVitaGuideStep(Number(button.dataset.guideStep)));
      });

      const total = document.getElementById("vitaGuideStepTotal");
      if (total) total.textContent = String(status.total);
      const label = document.getElementById("vitaGuideProgressLabel");
      if (label) label.textContent = status.count === status.total ? "Tüm adımları tamamladınız" : `${status.count} / ${status.total} adım tamamlandı`;
      const bar = document.getElementById("vitaGuideProgressBar");
      if (bar) bar.style.width = `${Math.round(status.count / status.total * 100)}%`;
      const progress = document.getElementById("vitaGuideProgress");
      if (progress) progress.setAttribute("aria-valuenow", String(status.count));
      const start = document.getElementById("vitaGuideStartTour");
      if (start) {
        const resume = status.count > 0 && status.nextIndex > 0;
        start.dataset.startIndex = resume ? String(status.nextIndex) : "0";
        const startLabel = document.getElementById("vitaGuideStartLabel");
        if (startLabel) startLabel.textContent = resume ? `Turu ${status.nextIndex + 1}. adımdan sürdür` : "Turu başlat";
      }
    }

    function openVitaGuideStep(index) {
      const step = VITA_GUIDE_STEPS[index];
      if (!step) return;
      if (window.SoundEffects) SoundEffects.playClick();
      closeOnboardingModal();
      step.open();
      if (step.view === state.activeTab) {
        const target = findVitaGuideTarget(step);
        if (target) window.setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
      }
    }

    /* ADIM ADIM TUR */
    function isVitaGuideElementVisible(el) {
      if (!el || !el.getClientRects().length) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return false;
      const style = window.getComputedStyle(el);
      return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) !== 0;
    }

    function findVitaGuideTarget(step) {
      for (const selector of step.targets || []) {
        const match = Array.from(document.querySelectorAll(selector)).find(isVitaGuideElementVisible);
        if (match) return match;
      }
      return null;
    }

    function clearVitaSpotlightTimers() {
      vitaSpotlightTimers.forEach(id => window.clearTimeout(id));
      vitaSpotlightTimers = [];
    }

    function startVitaSpotlightTour(manual = true, startIndex = 0) {
      if (!activeUserId) { showToast("Önce giriş yapın", "Kullanım turunu başlatmak için önce hesabınıza giriş yapın.", "warning"); return; }
      if (window.SoundEffects) SoundEffects.playClick();
      const layer = document.getElementById("vitaSpotlightLayer");
      if (!layer) { showToast("Rehber açılamadı", "Tur öğesi bulunamadı. Sayfayı yenileyip tekrar deneyin.", "error"); return; }
      closeOnboardingModal();
      if (!vitaSpotlightActive) vitaSpotlightReturnView = state.activeTab || "view-home";
      vitaSpotlightActive = true;
      layer.classList.remove("hidden");
      attachVitaSpotlightListeners();
      if (manual) showVitaSpotlightStep(Math.max(0, Math.min(VITA_GUIDE_STEPS.length - 1, Number(startIndex) || 0)));
      else showVitaSpotlightIntro();
    }

    function attachVitaSpotlightListeners() {
      if (vitaSpotlightListeners) return;
      let frame = 0;
      const reposition = () => {
        if (frame) return;
        frame = window.requestAnimationFrame(() => { frame = 0; positionVitaSpotlightTarget(); });
      };
      const onKey = event => {
        if (!vitaSpotlightActive) return;
        if (event.key === "Escape") { event.preventDefault(); finishVitaSpotlightTour(true, { quiet: true }); }
        else if (event.key === "ArrowRight") { event.preventDefault(); moveVitaSpotlightTour(1); }
        else if (event.key === "ArrowLeft") { event.preventDefault(); moveVitaSpotlightTour(-1); }
      };
      window.addEventListener("resize", reposition, { passive: true });
      window.addEventListener("scroll", reposition, { passive: true, capture: true });
      document.addEventListener("keydown", onKey);
      vitaSpotlightListeners = { reposition, onKey };
    }

    function detachVitaSpotlightListeners() {
      if (!vitaSpotlightListeners) return;
      window.removeEventListener("resize", vitaSpotlightListeners.reposition);
      window.removeEventListener("scroll", vitaSpotlightListeners.reposition, { capture: true });
      document.removeEventListener("keydown", vitaSpotlightListeners.onKey);
      vitaSpotlightListeners = null;
    }

    function setVitaTourContent({ count, title, description, status, statusClass, action, previous, next, dots }) {
      const set = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };
      set("vitaTourCount", el => { el.textContent = count; });
      set("vitaTourTitle", el => { el.textContent = title; });
      set("vitaTourDescription", el => { el.textContent = description; });
      set("vitaTourStatus", el => {
        el.textContent = status || "";
        el.className = `vita-tour-status ${statusClass || ""}`.trim();
        el.hidden = !status;
      });
      set("vitaTourAction", el => {
        el.hidden = !action;
        if (action) el.textContent = action;
      });
      set("vitaTourPrevious", el => {
        el.hidden = previous === null;
        if (previous !== null) { el.textContent = previous.label; el.disabled = previous.disabled; }
      });
      set("vitaTourNext", el => { el.innerHTML = next; });
      set("vitaTourDots", el => { el.innerHTML = dots; });
    }

    function vitaTourDotsHtml(activeIndex, status) {
      return VITA_GUIDE_STEPS.map((step, index) => {
        const cls = [index === activeIndex ? "is-active" : "", status.done[index] ? "is-done" : ""].join(" ").trim();
        return `<span class="${cls}" title="${index + 1}. ${escapeVitaGuideText(step.title)}"></span>`;
      }).join("");
    }

    function showVitaSpotlightIntro() {
      vitaSpotlightStepIndex = -1;
      const layer = document.getElementById("vitaSpotlightLayer");
      if (layer) layer.classList.add("is-centered");
      const name = state.user && state.user.name ? String(state.user.name).split(" ")[0] : "";
      setVitaTourContent({
        count: "Hoş geldiniz",
        title: name ? `Merhaba ${name}, kısa bir tur?` : "Kısa bir tur?",
        description: `VitaTakip'in ${VITA_GUIDE_STEPS.length} temel ekranını yaklaşık bir dakikada gösterelim. Turu daha sonra menüdeki "Nasıl Kullanılır?" bölümünden de başlatabilirsiniz.`,
        status: "", action: "",
        previous: { label: "Şimdi değil", disabled: false },
        next: 'Turu başlat <i class="fa-solid fa-arrow-right ml-1"></i>',
        dots: ""
      });
      positionVitaSpotlightTarget();
      focusVitaTourNext();
    }

    function showVitaSpotlightStep(index) {
      const step = VITA_GUIDE_STEPS[index];
      if (!step) return finishVitaSpotlightTour(true);
      vitaSpotlightStepIndex = index;
      const layer = document.getElementById("vitaSpotlightLayer");
      if (layer) layer.classList.remove("is-centered");
      if (state.activeTab !== step.view) navigateToView(step.view);
      const status = getVitaGuideStatus();
      const done = status.done[index];
      const last = index === VITA_GUIDE_STEPS.length - 1;
      setVitaTourContent({
        count: `${index + 1} / ${VITA_GUIDE_STEPS.length}`,
        title: `${index + 1}. ${step.title}`,
        description: step.detail,
        status: done ? "Bu adımı tamamladınız" : "Henüz yapılmadı",
        statusClass: done ? "is-done" : "is-todo",
        action: step.actionLabel,
        previous: { label: "Geri", disabled: index === 0 },
        next: last ? 'Turu bitir <i class="fa-solid fa-check ml-1"></i>' : 'İleri <i class="fa-solid fa-arrow-right ml-1"></i>',
        dots: vitaTourDotsHtml(index, status)
      });

      // Ekran geçiş animasyonu bitmeden ölçülen konum kayar; birkaç kez yeniden hizala.
      clearVitaSpotlightTimers();
      const hole = document.getElementById("vitaSpotlightHole");
      if (hole) hole.style.opacity = "0";
      vitaSpotlightTimers.push(window.setTimeout(() => {
        const target = findVitaGuideTarget(step);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        positionVitaSpotlightTarget();
      }, 60));
      [320, 650].forEach(delay => vitaSpotlightTimers.push(window.setTimeout(positionVitaSpotlightTarget, delay)));
      focusVitaTourNext();
    }

    function focusVitaTourNext() {
      window.setTimeout(() => {
        const next = document.getElementById("vitaTourNext");
        if (next && vitaSpotlightActive) { try { next.focus({ preventScroll: true }); } catch (_) {} }
      }, 120);
    }

    function positionVitaSpotlightTarget() {
      const hole = document.getElementById("vitaSpotlightHole");
      const tooltip = document.getElementById("vitaTourTooltip");
      const layer = document.getElementById("vitaSpotlightLayer");
      if (!hole || !tooltip || !vitaSpotlightActive) return;
      const step = VITA_GUIDE_STEPS[vitaSpotlightStepIndex];
      const target = step ? findVitaGuideTarget(step) : null;
      const tooltipWidth = Math.min(390, window.innerWidth - 28);
      const tooltipHeight = tooltip.offsetHeight || 220;

      if (!target) {
        // Hedef yoksa (ör. karşılama kartı) kartı ortala ve tüm ekranı karart.
        if (layer) layer.classList.add("is-centered");
        hole.style.display = "none";
        tooltip.style.left = `${Math.max(14, (window.innerWidth - tooltipWidth) / 2)}px`;
        tooltip.style.top = `${Math.max(14, (window.innerHeight - tooltipHeight) / 2)}px`;
        return;
      }
      if (layer) layer.classList.remove("is-centered");
      hole.style.display = "block";
      hole.style.opacity = "1";
      const rect = target.getBoundingClientRect();
      const pad = 6;
      const left = Math.max(6, rect.left - pad);
      const top = Math.max(6, rect.top - pad);
      const width = Math.min(window.innerWidth - left - 6, Math.max(40, rect.width + pad * 2));
      const height = Math.min(window.innerHeight - top - 6, Math.max(36, rect.height + pad * 2));
      hole.style.left = `${left}px`; hole.style.top = `${top}px`; hole.style.width = `${width}px`; hole.style.height = `${height}px`;

      // Kartı hedefin altına, sığmazsa üstüne koy; ikisi de olmazsa hedefle çakışmayacak en uygun kenara yasla.
      const below = rect.bottom + 16;
      const above = rect.top - tooltipHeight - 16;
      let tipTop;
      if (below + tooltipHeight <= window.innerHeight - 10) tipTop = below;
      else if (above >= 10) tipTop = above;
      else tipTop = rect.top > window.innerHeight / 2 ? 10 : window.innerHeight - tooltipHeight - 10;
      tipTop = Math.max(10, Math.min(window.innerHeight - tooltipHeight - 10, tipTop));
      let tipLeft = rect.left + rect.width / 2 - tooltipWidth / 2;
      tipLeft = Math.max(14, Math.min(window.innerWidth - tooltipWidth - 14, tipLeft));
      tooltip.style.left = `${tipLeft}px`; tooltip.style.top = `${tipTop}px`;
    }

    function moveVitaSpotlightTour(delta) {
      if (!vitaSpotlightActive) return;
      if (vitaSpotlightStepIndex === -1) {
        // Karşılama kartı: "Şimdi değil" turu kapatır, "Turu başlat" ilk adıma geçer.
        if (delta < 0) return finishVitaSpotlightTour(true, { quiet: true });
        return showVitaSpotlightStep(0);
      }
      const next = vitaSpotlightStepIndex + delta;
      if (next < 0) return;
      if (next >= VITA_GUIDE_STEPS.length) return finishVitaSpotlightTour(true);
      showVitaSpotlightStep(next);
    }

    function runVitaTourStepAction() {
      const step = VITA_GUIDE_STEPS[vitaSpotlightStepIndex];
      if (!step) return;
      if (window.SoundEffects) SoundEffects.playClick();
      finishVitaSpotlightTour(true, { quiet: true, stay: true });
      step.open();
    }

    function finishVitaSpotlightTour(markSeen = true, options = {}) {
      const wasActive = vitaSpotlightActive;
      const layer = document.getElementById("vitaSpotlightLayer");
      if (layer) layer.classList.add("hidden");
      if (layer) layer.classList.remove("is-centered");
      clearVitaSpotlightTimers();
      detachVitaSpotlightListeners();
      vitaSpotlightActive = false;
      if (markSeen && activeUserId) safeLocalStorageSetItem(`vitatakip_spotlight_seen_${activeUserId}`, "true");
      const returnView = vitaSpotlightReturnView;
      vitaSpotlightReturnView = null;
      if (!wasActive) return;
      if (!options.stay && returnView && returnView !== state.activeTab) navigateToView(returnView);
      if (markSeen && !options.quiet) {
        const status = getVitaGuideStatus();
        const message = status.count === status.total
          ? "Tüm adımları tamamladınız. Rehbere menüdeki \"Nasıl Kullanılır?\" bölümünden dönebilirsiniz."
          : `Sıradaki adım: ${VITA_GUIDE_STEPS[status.nextIndex].title}. İlerlemenizi menüdeki "Nasıl Kullanılır?" bölümünde görebilirsiniz.`;
        showToast("Tur tamamlandı", message, "success");
      }
    }

    function startVitaSpotlightIfFirstVisit() {
      if (!activeUserId || safeLocalStorageGetItem(`vitatakip_spotlight_seen_${activeUserId}`) === "true") return;
      window.setTimeout(() => {
        if (!activeUserId || vitaSpotlightActive) return;
        if (safeLocalStorageGetItem(`vitatakip_spotlight_seen_${activeUserId}`) === "true") return;
        if (!document.getElementById("profileModal")?.classList.contains("hidden")) return;
        if (document.getElementById("vitaLegalOnboarding")) return;
        startVitaSpotlightTour(false);
      }, 500);
    }

    /* A4 BUZDOLABI ÇİZELGESİ */
