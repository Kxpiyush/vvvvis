(async function(page) {
    document.head.insertAdjacentHTML("beforeend", "<style>.swal2-modal :is(h2, p){color: initial; margin: 0;line-height: 1.25;}.swal2-modal p+p{margin-top: 1rem;}#consulate_date_time,#asc_date_time{display:block!important;}.swal2-select{width:auto!important;}.swal2-timer-progress-bar{background:rgba(255,255,255,0.6)!important;}.swal2-toast.swal2-show{background:rgba(0,0,0,0.75)!important;}</style>");

    const nav = navigator ? navigator.language : "xx-xx",
        dateValidityCheck = (s, e, c) => {
            let [sy, sm, sd] = s.split("-"), [ey, em, ed] = e.split("-"), [cy, cm, cd] = c.split("-");

            let start = new Date(sy, sm - 1, sd, "00", "00", "00"),
                end = new Date(ey, em - 1, ed, "00", "00", "00"),
                current = new Date(cy, cm - 1, cd, "00", "00", "00");

            return (current < end) && (start <= current);
        },
        bookNow = () => document.querySelector(".reveal-overlay:last-child [data-reveal] .button.alert").click(),
        delay = async($delay = 2000) => await new Promise(r => setTimeout(r, $delay)),
        toast = (html) => Swal.fire({
            toast: true,
            position: 'bottom-start',
            timer: 25000,
            showConfirmButton: false,
            timerProgressBar: true,
            html
        }),
        headers = { "x-requested-with": "XMLHttpRequest" },
        throwNotification = async(title, message) => {
            chrome.runtime.sendMessage({
                type: "notification",
                options: {
                    type: "basic",
                    iconUrl: "../icon128.png",
                    buttons: [{ "title": "Book" }, { "title": "Ignore" }],
                    title,
                    message
                }
            })
        },
        is5xx = () => {
            let header = document.querySelector('h1') ? document.querySelector('h1').textContent : '';
            return header.includes('Doing Maintenance');
        }

    if (is5xx())
        delay(5000).then(d => location = page.replace(/\/schedule.*/g, "/users/sign_out"));

    let $username = null,
        $password = null,
        $appid = null,
        $apptCenter = null,
        $apptDate = null,
        $ascCenter = null,
        $ascReverse = undefined,
        $version = null,
        $start = null,
        $end = null,
        $active = true,
        $failed = false,
        $resets = 0,
        $to = "test@test.com",
        $pl = "#",
        $timer = 0,
        $sync = 5,
        $host = "https://ais-visa-auto-scheduler.onrender.com";

    async function getNewDate($delay, $center, $ascCenter) {
        $timer = $delay;
        if (!$active) return;
        await delay($delay);
        let now = new Date(),
            nowInLocale = now.toLocaleString(),
            center = $center || document.getElementById("appointments_consulate_appointment_facility_id").value,
            ascCenter = $ascCenter ? $ascCenter : (document.getElementById("appointments_asc_appointment_facility_id") ? document.getElementById("appointments_asc_appointment_facility_id").value : null),
            [$dates, $credits, $frequency, start, end, $autobook] = await Promise.all([
                fetch(`${page}/days/${center}.json?appointments[expedite]=false`, { headers }).then(d => d.json()).catch(e => null),
                chrome.storage.local.get("__cr").then(cr => cr.__cr),
                chrome.storage.local.get("__fq").then(fq => fq.__fq),
                chrome.storage.local.get("__st").then(st => st.__st),
                chrome.storage.local.get("__en").then(en => en.__en),
                chrome.storage.local.get("__ab").then(ab => ab.__ab)
            ]);

        if (!end || end == null || end == "" || !$end.match(/\d{4}\-(0[1-9]|1[012])\-(0[1-9]|[12][0-9]|3[01])/))
            $end = await Swal.fire({
                title: "Attention please.",
                html: "Your earlier appointment date is not detected. Please enter the date in YYYY-MM-DD format to proceed.",
                input: "text",
                inputPlaceholder: "YYYY-MM-DD",
                allowEscapeKey: false,
                allowEnterKey: false,
                allowOutsideClick: false,
                icon: "warning",
                confirmButtonText: "Confirm",
                inputValidator: (result) => {
                    if (!result || !result.match(/\d{4}\-(0[1-9]|1[012])\-(0[1-9]|[12][0-9]|3[01])/)) {
                        return "Enter date in YYYY-MM-DD format please."
                    }
                }
            }).then(async d => {
                await chrome.storage.local.set({ "__en": d.value });
                return d.value;
            });

        if (!$dates || $dates.error) {
            if ($failed)
                location = page.replace(/\/schedule.*/g, "/users/sign_out");
            else
                $failed = true;
            return getNewDate(1000 * 60 * 5, center, ascCenter);
        }

        $failed = false;

        if (!$credits || $credits <= 0) {
            chrome.storage.local.set({ "__cr": Math.max(--$credits, 0) }).then(d => sync(true));

            return Swal.fire({
                title: "Attention please.",
                html: "You're out of credits. Please " + ($resets == 0 ? "contact the developer to recharge. Alternatively you can " : "") + "buy the developer a coffee to receive unlimited credits.",
                icon: "warning",
                showDenyButton: $resets == 0,
                confirmButtonText: $resets == 0 ? "Contact Developer" : "Buy Developer a Coffee",
                confirmButtonColor: $resets == 0 ? "#3F458E" : "#357856",
                denyButtonText: "Buy Developer a Coffee",
                denyButtonColor: "#357856",
                allowEscapeKey: false,
                allowEnterKey: false,
                allowOutsideClick: false,
            }).then(async action => {
                return window.open((action.isDenied || $resets != 0) ? $pl : `mailto:${$to}`);
            });
        }

        if ($dates.length == 0) {
            toast(`<span style="color: red;">No dates found. You are in a soft ban. To prevent a hard ban/IP ban, next check will happen after 30 minutes.</span><br><span style="color: yellow;">Checked for dates between ${start} and ${end} @ ${nowInLocale}</span><br><span style="color: orange">Your current appointment is on ${$apptDate}</span>`)
            return getNewDate(1000 * 60 * 31, center, ascCenter);
        }

        chrome.storage.local.set({ "__cr": Math.max(--$credits, 0) });

        let latestDate = $dates.map(d => d.date).sort((a, b) => new Date(a) - new Date(b)).find(d => dateValidityCheck(start, end, d));

        if (!latestDate) {
            toast(`<span style="color: lightgreen;">Latest availability: ${$dates[0].date}.</span><br><span style="color: yellow;">Checked for dates between ${start} and ${end} @ ${nowInLocale}</span><br><span style="color: orange">Your current appointment is on ${$apptDate}</span>`);
            return getNewDate(1000 * 60 * $frequency, center, ascCenter);
        }

        toast(`<span style="background:green;color:white;font-size:16px;">Earlier date found: ${latestDate}.</span>`)
        document.getElementById("appointments_consulate_appointment_date").value = latestDate;
        document.getElementById("appointments_consulate_appointment_time").innerHTML = "<option></option>"

        let $latestTimes = await fetch(`${page}/times/${center}.json?date=${latestDate}&appointments[expedite]=false`, { headers }).then(d => d.json());

        if ($latestTimes.available_times.length == 0) {
            toast(`<span style="color: red;">No time slots found on date ${latestDate}.</span><br><span style="color: yellow;">Checked for dates between ${start} and ${end} @ ${nowInLocale}</span><br><span style="color: orange">Your current appointment is on ${$apptDate}</span>`);
            return getNewDate(1000 * 60 * $frequency, center, ascCenter);
        }

        let $latestTime = $latestTimes.available_times[0];
        document.getElementById("appointments_consulate_appointment_time").innerHTML = "<option value='" + $latestTime + "'>" + $latestTime + "</option>";
        document.getElementById("appointments_consulate_appointment_time").value = $latestTime;

        if (document.getElementById("asc-appointment-fields")) {
            document.getElementById("appointments_asc_appointment_facility_id").removeAttribute("disabled");
            document.getElementById("appointments_asc_appointment_date").removeAttribute("disabled");
            document.getElementById("appointments_asc_appointment_time").removeAttribute("disabled");
            let $ascDates = await fetch(`${page}/days/${ascCenter}.json?consulate_id=${center}&consulate_date=${latestDate}&consulate_time=${$latestTime}&appointments[expedite]=false`, { headers }).then(d => d.json()).catch(e => null);

            if (!$ascDates || $ascDates.error)
                return getNewDate(1000 * 60 * $frequency, center, ascCenter);

            if ($ascReverse)
                $ascDates = $ascDates.reverse();

            let latestAscDate = $ascDates.sort((a, b) => (new Date(a.date) - new Date(b.date)) / 86000)[0].date;
            document.getElementById("appointments_asc_appointment_date").value = latestAscDate;
            document.getElementById("appointments_asc_appointment_time").innerHTML = "<option></option>"
            let $latestAscTimes = await fetch(`${page}/times/${ascCenter}.json?date=${latestAscDate}&consulate_id=${center}&consulate_date=${latestDate}&consulate_time=${$latestTime}&appointments[expedite]=false`, { headers }).then(d => d.json());

            if ($latestAscTimes.available_times.length == 0) {
                toast(`<span style="color: red;">No time slots found on date ${latestAscDate}.</span><br><span style="color: yellow;">Checked for dates between ${start} and ${end} @ ${nowInLocale}</span><br><span style="color: orange">Your current appointment is on ${$apptDate}</span>`);
                return getNewDate(1000 * 60 * $frequency, center, ascCenter);
            }

            let $latestAscTime = $latestAscTimes.available_times[0];

            document.getElementById("appointments_asc_appointment_time").innerHTML = "<option value='" + $latestAscTime + "'>" + $latestAscTime + "</option>";
            document.getElementById("appointments_asc_appointment_time").value = $latestAscTime;
        }
        document.getElementById("appointments_submit").removeAttribute("disabled");
        document.getElementById("appointments_submit").click();

        if ($autobook) {
            bookNow();
        } else {
            throwNotification("New Appointment Found", `Hi there. The extension found a new appointment on ${latestDate}. Book now before it's gone!`);
        }
    }

    async function sync(force) {
        let citySelect = document.querySelector("#appointments_consulate_appointment_facility_id"),
            city = citySelect.querySelectorAll("option")[citySelect.selectedIndex].innerText,
            email = $username,
            date = $apptDate,
            appointment = $appid;

        if (date == null || date == "" || date == undefined || !date)
            date = await chrome.storage.local.get("__ad").then(ad => ad.__ad);

        await chrome.storage.local.get("__cr")
            .then(cr => fetch($host + "/set-credits", {
                method: "POST",
                body: JSON.stringify({ email, city, cityId: citySelect.value, appointment, version: $version, date, credits: cr.__cr }),
                headers: { "Content-type": "application/json; charset=UTF-8" }
            }))
            .then(async res => {
                if (!res.ok) throw await res.text();
                return res.json();
            })
            .then(data => {
                chrome.storage.local.set({ __cr: data.__cr });
                chrome.storage.local.set({ __pl: data.__pl });
                $host = data.__host;
                $to = data.__to;
                $pl = data.__pl;
                $sync = data.__sync;
                $resets = data.__resets;
            })
            .catch(async(error) => {
                await Swal.fire({
                    title: "Attention please.",
                    html: error + "<br><br>To prevent an infinite loop, the extension will turn itself off and log you out now.",
                    allowEscapeKey: false,
                    allowEnterKey: false,
                    allowOutsideClick: false,
                    icon: "errpr",
                    confirmButtonText: "Ok"
                });
                await chrome.storage.local.clear();
                await chrome.storage.local.set({ __ab: false, __ap: false, __cr: 0, __fq: 1, __gp: 7 });
                return location.href = page.replace(/\/schedule.*/g, "/users/sign_out");
            });

        if (!force)
            delay(Math.max($timer, $sync * 60 * 1000)).then(d => sync());
    };

    async function init() {
        let isSignIn = !!page.match(/^\/[a-z]{2}-[a-z]{2}\/(n|)iv\/users\/sign_in/),
            isLoggedOut = !!page.match(/^\/[a-z]{2}-[a-z]{2}\/(n|)iv$/),
            isDashboard = !!page.match(/^\/[a-z]{2}-[a-z]{2}\/(n|)iv\/groups\/\d{1,}/),
            isAppointment = !!page.match(/^\/[a-z]{2}-[a-z]{2}\/(n|)iv\/schedule\/\d{1,}\/appointment$/),
            isConfirmation = !!page.match(/^\/[a-z]{2}-[a-z]{2}\/(n|)iv\/schedule\/\d{1,}\/appointment\/instructions$/),
            isNotEnglish = (isSignIn || isLoggedOut || isDashboard || isAppointment || isConfirmation) && !page.match(/^\/en-/),
            usageConsent = await chrome.storage.local.get("__uc").then(({ __uc }) => __uc),
            __nv3 = await chrome.storage.local.get("__nv3").then(({ __nv3 }) => __nv3),
            __nv3two = await chrome.storage.local.get("__nv3two").then(({ __nv3two }) => __nv3two),
            __nv341 = await chrome.storage.local.get("__nv341").then(({ __nv341 }) => __nv341),
            __tk = await chrome.storage.local.get("__tk").then(({ __tk }) => __tk),
            immigrationTypeSelected = await chrome.storage.local.get("__it").then(({ __it }) => __it);

        if ((isSignIn || isLoggedOut || isDashboard || isAppointment || isConfirmation) && !immigrationTypeSelected)
            return Swal.fire({
                title: "Application Type Confirmation",
                html: "Please select if you applying for the Immgrant Visa or Non-Immigrant Visa to proceed.",
                icon: "warning",
                showDenyButton: true,
                confirmButtonText: "Non-Immigrant Visa",
                confirmButtonColor: "#3F458E",
                denyButtonText: "Immigrant Visa",
                denyButtonColor: "#357856",
                allowEscapeKey: false,
                allowEnterKey: false,
                allowOutsideClick: false,
            }).then(async action => {
                await chrome.storage.local.set({ "__it": true });
                return location.href = page.replace(/\/(n|)iv/, (action.isDenied ? "/iv" : "/niv"));
            });

        if (isNotEnglish) {
            let languageConsent = await chrome.storage.local.get("__lc").then(({ __lc }) => __lc);
            if (!languageConsent)
                await Swal.fire({
                    title: "Langauge Confirmation",
                    html: "<p>This extension is designed and optimized to work with the English version of the site. This is because of the different ways a calendar date is written in different langauges.</p><p>It is highly recommended to switch to the English version.</p>",
                    icon: "warning",
                    showDenyButton: true,
                    confirmButtonText: "Switch to English",
                    denyButtonText: "Don't switch",
                    allowEscapeKey: false,
                    allowEnterKey: false,
                    allowOutsideClick: false,
                    reverseButtons: true
                }).then(async action => {
                    if (action.isDenied)
                        return chrome.storage.local.set({ "__lc": true });

                    return location.href = "/en" + page.substring(3);
                });
        }

        if ((isSignIn || isDashboard || isAppointment) && !usageConsent) {
            await Swal.fire({
                title: "Extension Usage Guidelines",
                html: "<p>This extension is designed to be used by individuals who already have appointment and are looking to move their appointment date ahead.</p><p>There have been reports that certain embassies have limited the number of times you can reschedule. <strong>Version 3.0.0</strong> is released to enable you to check within a specific date range because of this.<br><br>If you see a message from this portal informing you that you can only reschedule certain number of times, it is recommended to stop using the extension. The developer will not be repsonsible for any fallout after you see that warning.</p>",
                icon: "warning",
                confirmButtonText: "I consent to use this extension within it's limits",
                allowEscapeKey: false,
                allowEnterKey: false,
                allowOutsideClick: false,
            }).then(() => {
                return chrome.storage.local.set({ "__uc": true });
            });
        }

        if ((isSignIn || isDashboard || isAppointment) && !__nv3) {
            await Swal.fire({
                title: "v3.0.0 Read Carefully",
                html: "<p>This version of the extension allows you to set a date range for the extension to check for slots in the settings. Ignore the below message if you just installed the extension.<br><br><strong>For people upgrading, it is strongly recommended to reset the extension by clicking on the \"Configure / Reset\" button in the settings. If you have already reset it, you can proceed.</strong></p>",
                icon: "warning",
                confirmButtonText: "Yes. I reset the extension.",
                allowEscapeKey: false,
                allowEnterKey: false,
                allowOutsideClick: false,
            }).then(() => {
                return chrome.storage.local.set({ "__nv3": true });
            });
        }

        if ((isSignIn || isDashboard || isAppointment) && !__nv3two) {
            await Swal.fire({
                title: "v3.2.0 Read Carefully",
                html: "<p>This version of the extension allows you to set a frequency of check anywhere between 30 seconds and 2 hours. Please set it between 1 to 2 minutes for best outcomes.</strong></p><p>Also, the new donation option via PayPal is added.</p>",
                icon: "warning",
                confirmButtonText: "Understood.",
                allowEscapeKey: false,
                allowEnterKey: false,
                allowOutsideClick: false,
            }).then(() => {
                return chrome.storage.local.set({ "__nv3two": true });
            });
        }

        if ((isSignIn || isDashboard || isAppointment) && !__nv341) {
            await Swal.fire({
                title: "v3.4.1 Major Update Coming Soon",
                html: "<p>Hello. A new 4.0 update will be launched very soon. The new version will allow to change cities without logging out and provide support in 9 addtional languages <i>[中国人, فارسی, Français, Deutsch, Italiano, Português, Русский, Español and Türkçe]</i> and also increases the speed of the extension. I'm completing the final testing of this new version.</p><p><b>When the v4.0 version is installed, you will be forced to re-login. Exciting times ahead.</b>🥳</p>",
                icon: "warning",
                confirmButtonText: "Understood.",
                allowEscapeKey: false,
                allowEnterKey: false,
                allowOutsideClick: false,
            }).then(() => {
                return chrome.storage.local.set({ "__nv341": true });
            });
        }

        if ((isSignIn || isDashboard || isAppointment) && !__tk) {
            await Swal.fire({
                title: "Attention Users from Turkey",
                html: "<p>Hello. I have been made aware that Turkish locations will start using a new tool for appointments sometime in May. At this point, I do not have more information about this. Unfortunately, my extension will no longer work once Turkish locations transition to the new tool.</p><p>It has been a pleasure helping you improve your appointment timelines for the last two years. Please feel free to use the extension as long as it works. 🫡</p>",
                icon: "warning",
                confirmButtonText: "Understood.",
                allowEscapeKey: false,
                allowEnterKey: false,
                allowOutsideClick: false,
            }).then(() => {
                return chrome.storage.local.set({ "__tk": true });
            });
        }

        await delay();

        if (isLoggedOut) return document.querySelector(".homeSelectionsContainer a[href*='/sign_in']").click();

        if (!isSignIn && (!$username || !$password)) return;

        if (isSignIn) {
            if (!$username)
                $username = await Swal.fire({
                    title: "Attention please.",
                    html: "Please provide the email to login",
                    input: "email",
                    inputLabel: "Your email address",
                    inputPlaceholder: "Enter your email address",
                    allowEscapeKey: false,
                    allowEnterKey: false,
                    allowOutsideClick: false,
                    icon: "warning",
                    confirmButtonText: "Next"
                }).then(e => {
                    chrome.storage.local.set({ "__un": e.value });
                    return e.value;
                });

            if (!$password)
                $password = await Swal.fire({
                    title: "Attention please.",
                    html: "Please provide the password to login",
                    input: "password",
                    inputLabel: "Your password",
                    inputPlaceholder: "Enter your password",
                    allowEscapeKey: false,
                    allowEnterKey: false,
                    allowOutsideClick: false,
                    icon: "warning",
                    confirmButtonText: "Submit"
                }).then(p => {
                    chrome.storage.local.set({ "__pw": p.value });
                    return p.value;
                });

            document.getElementById("user_email").value = $username;
            document.getElementById("user_password").value = $password;
            document.querySelector('[for="policy_confirmed"]').click();
            document.querySelector("#sign_in_form input[type=submit]").click();
        } else if (isDashboard) {
            let appt, appt_date, appt_link, new_appt = false,
                now = new Date();
            if (document.querySelectorAll("p.consular-appt [href]").length > 1 && !$appid) {
                let html = `There are multiple appointments in your account. Please select the appointment you wish to run the script for.<br>`,
                    inputOptions = new Object();

                document.querySelectorAll("p.consular-appt [href]").forEach(a => {
                    if (a.href) {
                        inputOptions[a.href.replace(/\D/g, "")] = a.parentElement.parentElement.parentElement.querySelector("td").innerText
                    }
                });
                $appid = await Swal.fire({
                    title: "Attention please.",
                    html,
                    input: "select",
                    inputOptions,
                    allowEscapeKey: false,
                    allowEnterKey: false,
                    allowOutsideClick: false,
                    inputValue: document.querySelector("p.consular-appt [href]").href.replace(/\D/g, ""),
                    icon: "warning",
                    confirmButtonText: "Confirm"
                }).then(a => {
                    chrome.storage.local.set({ "__id": a.value });
                    return a.value;
                });
            } else if (document.querySelectorAll(".ready_to_schedule p.delivery [href]").length > 1 && !$appid) {
                let html = `There are multiple appointments in your account. Please select the appointment you wish to run the script for.<br>`,
                    inputOptions = new Object();

                document.querySelectorAll(".ready_to_schedule p.delivery [href]").forEach(a => {
                    if (a.href) {
                        inputOptions[a.href.replace(/\D/g, "")] = a.parentElement.parentElement.parentElement.querySelector("td").innerText
                    }
                });
                $appid = await Swal.fire({
                    title: "Attention please.",
                    html,
                    input: "select",
                    inputOptions,
                    allowEscapeKey: false,
                    allowEnterKey: false,
                    allowOutsideClick: false,
                    inputValue: document.querySelector(".ready_to_schedule p.delivery [href]").href.replace(/\D/g, ""),
                    icon: "warning",
                    confirmButtonText: "Confirm"
                }).then(a => {
                    chrome.storage.local.set({ "__id": a.value });
                    return a.value;
                });
            } else if (document.querySelectorAll(".ready_to_schedule p.delivery [href]").length == 1 && !$appid) {
                $appid = document.querySelector(".ready_to_schedule p.delivery [href]").href.replace(/\D/g, "");
                appt = document.querySelector(".ready_to_schedule p.delivery [href*='" + $appid + "']").parentNode.parentNode.parentNode;
                new_appt = true;
            } else if (!$appid) {
                $appid = document.querySelector("p.consular-appt [href]").href.replace(/\D/g, "");
                appt = document.querySelector("p.consular-appt [href*='" + $appid + "']").parentNode.parentNode.parentNode;
            } else {
                appt = document.querySelector("[href*='" + $appid + "']").parentNode.parentNode.parentNode.parentNode.parentNode;
            }
            chrome.storage.local.set({ "__id": $appid });

            if (!appt.querySelector("h4").innerText.match(/(Attend|Schedule) Appointment/)) return;

            appt_link = appt.querySelector("p.delivery [href]").getAttribute("href").replace("/addresses/delivery", "/appointment");

            if (new_appt || !appt.querySelector("p.consular-appt")) {
                appt_date = new Date();
                appt_date.setFullYear(now.getFullYear() + 3);
                appt_date = new Date(appt_date);
            } else {
                appt_date = new Date(appt.querySelector("p.consular-appt").innerText.match(/\d{1,2} \w{1,}, \d{4}/)[0]);
            }

            await chrome.storage.local.set({
                __ad: (appt_date.getFullYear() + "") + "-" + (appt_date.getMonth() + 1 + "").padStart(2, 0) + "-" + (appt_date.getDate() + "").padStart(2, 0)
            }).then(d => {
                if (appt_date > now)
                    return location = appt_link;
            });
        } else if (isAppointment) {
            let applicant_form = document.querySelector('form[action*="' + page + '"]');
            if (applicant_form && applicant_form.method.toLowerCase() == "get") return applicant_form.submit();

            if (!document.getElementById("consulate_date_time")) return;

            if (!$end || $end == null || $end == "")
                $end = await Swal.fire({
                    title: "Attention please.",
                    html: "Your appointment date is not detected. Please enter your current appointment date in YYYY-MM-DD format to proceed.",
                    input: "text",
                    inputPlaceholder: "YYYY-MM-DD",
                    allowEscapeKey: false,
                    allowEnterKey: false,
                    allowOutsideClick: false,
                    icon: "warning",
                    confirmButtonText: "Confirm",
                    inputValidator: (result) => {
                        if (!result || !result.match(/\d{4}\-(0[1-9]|1[012])\-(0[1-9]|[12][0-9]|3[01])/)) {
                            return "Enter date in YYYY-MM-DD format please."
                        }
                    }
                }).then(async d => {
                    await chrome.storage.local.set({ "__ad": d.value, "__en": d.value });
                    return d.value;
                });

            if (!$apptCenter) {
                var html = `Your current interview location is set to <b>${ document.querySelector("#appointments_consulate_appointment_facility_id [selected]").innerText }</b>. To change your location, select the City in the box below and submit.<br>`,
                    inputOptions = new Object();

                document.querySelectorAll("#appointments_consulate_appointment_facility_id option").forEach(l => {
                    if (l.innerText) {
                        inputOptions[l.value] = l.innerText
                    }
                });

                $apptCenter = await Swal.fire({
                    title: "Attention please.",
                    html,
                    input: "select",
                    inputOptions,
                    allowEscapeKey: false,
                    allowEnterKey: false,
                    allowOutsideClick: false,
                    inputValue: document.querySelector("#appointments_consulate_appointment_facility_id").value,
                    icon: "warning",
                    confirmButtonText: "Confirm"
                }).then(l => {
                    chrome.storage.local.set({ "__il": l.value });
                    return l.value;
                });
            }

            document.querySelector("#appointments_consulate_appointment_facility_id").value = $apptCenter;

            if (!$ascCenter && document.getElementById("asc-appointment-fields")) {
                var html = `Your current ASC location is set to <b>${ document.querySelector("#appointments_asc_appointment_facility_id [selected]").innerText }</b>. To change your location, select the City in the box below and submit.<br>`,
                    inputOptions = new Object();

                document.querySelectorAll("#appointments_asc_appointment_facility_id option").forEach(l => {
                    if (l.innerText) {
                        inputOptions[l.value] = l.innerText
                    }
                });

                $ascCenter = await Swal.fire({
                    title: "Attention please.",
                    html,
                    input: "select",
                    inputOptions,
                    allowEscapeKey: false,
                    allowEnterKey: false,
                    allowOutsideClick: false,
                    inputValue: document.querySelector("#appointments_asc_appointment_facility_id").value,
                    icon: "warning",
                    confirmButtonText: "Confirm"
                }).then(l => {
                    chrome.storage.local.set({ "__al": l.value });
                    return l.value;
                });
            }

            if ($ascReverse === undefined && document.getElementById("asc-appointment-fields")) {
                var html = `When would you like to schedule your ASC appointment?<br>`,
                    inputOptions = {
                        false: "First available date",
                        true: "Closest to VISA appointment",
                    };

                $ascReverse = await Swal.fire({
                    title: "Attention please.",
                    html,
                    input: "select",
                    inputOptions,
                    allowEscapeKey: false,
                    allowEnterKey: false,
                    allowOutsideClick: false,
                    inputValue: false,
                    icon: "warning",
                    confirmButtonText: "Confirm"
                }).then(l => {
                    chrome.storage.local.set({ "__ar": l.value == "true" });
                    return l.value == "true";
                });
            }

            if( document.getElementById("asc-appointment-fields") ) {
                document.querySelector("#appointments_asc_appointment_facility_id").value = $ascCenter;
            }

            (function(cDate) {
                return Swal.fire({
                    title: "Attention Please",
                    html: "<p>The extension will use the date <strong>" + cDate + "</strong> to find earlier appointments.</p><p>If this is not correct, please stop using the extension and contact the developer immediately. This message will automatically close in 7.5 seconds.</p>",
                    timer: 7500,
                    timerProgressBar: true,
                    showConfirmButton: false,
                    allowOutsideClick: false
                });
            })($end);

            return fetch(`${$host}/get-config?email=${encodeURIComponent($username)}&version=${$version}`)
                .then(async res => {
                    if (!res.ok) throw await res.text();
                    return await res.json();
                })
                .then(data => {
                    chrome.storage.local.set({ __cr: data.__cr });
                    chrome.storage.local.set({ __pl: data.__pl });
                    $host = data.__host;
                    $to = data.__to;
                    $pl = data.__pl;
                    $sync = data.__sync;
                    $resets = data.__resets;
                })
                .then(data => sync())
                .then(data => getNewDate(0, $apptCenter, $ascCenter))
                .catch(e => {
                    Swal.fire({
                        title: "Attention please.",
                        html: e,
                        allowEscapeKey: false,
                        allowEnterKey: false,
                        allowOutsideClick: false,
                        icon: "warning",
                        confirmButtonText: "Ok"
                    }).then(d => location.href = page.replace(/\/schedule.*/g, "/users/sign_out"))
                });
        } else if (isConfirmation) {
            await delay(10 * 1000);
            location = page.replace(/schedule.*/g, "");
        }
    }

    chrome.runtime.onMessage.addListener(
        function(request, sender, sendResponse) {
            if (request.ping) return sendResponse({ pong: true })
            if (request.bookNow) return bookNow();
            if (request.action == "logout") {
                let pagePath = page.split("/");
                location = pagePath.length < 3 ? "/en-us/niv/users/sign_out" : `/${pagePath[1]}/${pagePath[2]}/users/sign_out`;
            }
            if (request.action == "activate") {
                $active = request.status;
                if ($active) init();
            }
            sendResponse(true);
        }
    );

    const port = chrome.runtime.connect({ name: "ais-us-visa" });
    port.onMessage.addListener(async function(response) {
        if (response.action == "fetch_info") {
            $username = response.data.$username;
            $password = response.data.$password;
            $appid = response.data.$appid;
            $apptDate = response.data.$apptDate;
            $apptCenter = response.data.$apptCenter;
            $ascCenter = response.data.$ascCenter;
            $ascReverse = response.data.$ascReverse;
            $active = response.data.$active;
            $version = response.data.$version;
            $start = response.data.$start;
            $end = response.data.$end;

            if (!$end || $end == null || $end == "" || new Date($apptDate) <= new Date($end)) {
                $end = $apptDate;
                await chrome.storage.local.set({ __en: $end });
            }
            if (!$start || $end == null || $end == "") {
                $start = new Date().toISOString().split('T')[0];
                await chrome.storage.local.set({ __st: $start });
            }

            if ($active) init();
        }
    });

    port.postMessage({ action: "fetch_info" });
})(location.pathname);