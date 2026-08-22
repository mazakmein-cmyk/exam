/**
 * Hindi copy for the student home page (/hindi). Its own module so these
 * strings ship ONLY in the /hindi route chunk and never on the English
 * critical path — see homeCopy.ts for the contract and the translation notes.
 */
import type { HomeCopy } from "@/i18n/homeCopy";

/* ─────────────────────────── Hindi ─────────────────────────── */

export const HOME_COPY_HI: HomeCopy = {
    hero: {
        forLabel: "इनके लिए",
        h1a: "फ्री मॉक टेस्ट और",
        h1b: "पिछले वर्षों के पेपर",
        subA: "असली परीक्षा की घड़ी के नीचे अभ्यास कीजिए — उत्तर कुंजी और तुरंत स्कोरिंग के साथ। ",
        subB: "100% फ्री, कोई डाउनलोड नहीं।",
        searchPlaceholder: '"MTS 2024" या "previous year paper" खोजिए…',
        searchAria: "मॉक टेस्ट और पिछले वर्षों के पेपर खोजें",
        pyqBadge: "पिछले वर्ष का पेपर · उत्तर कुंजी",
        start: "शुरू करें",
        browseFull: "पूरी लाइब्रेरी देखें →",
        noMatchLead: "अभी कुछ नहीं मिला — कोई परीक्षा नाम आज़माइए, जैसे",
        noMatchBrowse: "सब कुछ देखें",
        chipsQuestion: "आप किस परीक्षा की तैयारी कर रहे हैं?",
        more: "और",
        ctaTitle: "फ्री मॉक टेस्ट शुरू करें",
        browseCategory: (c) => `${c} के पेपर देखें`,
        browseLibrary: "फ्री लाइब्रेरी देखें",
        trustLine: "शुरू करने के लिए साइन-अप ज़रूरी नहीं · असली CBT इंटरफ़ेस · तुरंत उत्तर कुंजी",
    },
    cycle: {
        eyebrow: "लाइव साइकिल",
        titleMts: "SSC MTS सितंबर 2026 — लाइव मॉक टेस्ट सीरीज़",
        titleGeneric: "इस परीक्षा सीज़न पर एक नज़र",
        titleCategory: (c) => `${c} — आपकी तैयारी, समय पर`,
        mtsBadge: "SSC MTS सितंबर 2026",
        opensIn: "सितंबर–नवंबर परीक्षा विंडो खुलने में",
        calendarNote: "आधिकारिक SSC कैलेंडर के अनुसार। सटीक शिफ्ट तारीख़ें एडमिट कार्ड के साथ आएँगी।",
        openNowTitleA: "2026 परीक्षा विंडो ",
        openNowTitleB: "अभी खुली है",
        openNowNote: "शिफ्टें सितंबर–नवंबर चल रही हैं। अब हर प्रैक्टिस सेशन असली रिहर्सल है।",
        closedTitle: "2026 विंडो बंद हो चुकी है।",
        closedNote: "अगली साइकिल की बढ़त आज से शुरू होती है।",
        cycleLink: "2026 साइकिल की पूरी जानकारी",
        countdown: { days: "दिन", hrs: "घंटे", min: "मिनट", sec: "सेकंड" },
        shelfEyebrow: "आपकी परीक्षा शेल्फ",
        shelfTitle: (c) => `हर ${c} पेपर, एक ही शेल्फ पर।`,
        shelfNote: "मॉक और पिछले वर्षों के पेपर — ठीक उसी परीक्षा के लिए छाँटे हुए जिसकी आप तैयारी कर रहे हैं।",
        shelfButton: (c) => `${c} शेल्फ खोलें`,
        resumeEyebrow: "जहाँ छोड़ा था, वहीं से",
        resumeNote: (c) =>
            `आपने यह पेपर खोला था${c ? ` (${c})` : ""} — घड़ी के नीचे इसे पूरा कीजिए और उत्तर कुंजी से अपना स्कोर देखिए।`,
        resumeButton: "जारी रखें",
        firstEyebrow: "पहली बार आए हैं?",
        firstTitle: "परीक्षा वाले दिन से पहले असली परीक्षा स्क्रीन देखिए।",
        firstNote:
            "यहाँ का हर पेपर उसी कंप्यूटर-बेस्ड-टेस्ट इंटरफ़ेस में चलता है जो आपको परीक्षा हॉल में मिलेगा — क्वेश्चन पैलेट, मार्क-फ़ॉर-रिव्यू, सब कुछ। इसी पेज पर आज़माइए।",
        firstLink: "नीचे लाइव डेमो आज़माइए",
    },
    papers: {
        eyebrowPyq: "उत्तर कुंजी के साथ",
        eyebrowFresh: "नए पेपर",
        titlePyq: (scope) => `पिछले वर्षों के पेपर — ${scope}`,
        titleMock: (scope) => `नवीनतम मॉक टेस्ट — ${scope}`,
        scopeAll: "हर परीक्षा",
        subtitlePyq: "बीती साइकिलों के असली पेपर, असली घड़ी के नीचे। पहले हल कीजिए, फिर उत्तर कुंजी से मिलाइए।",
        subtitleFallback: (c) => `${c} के लिए अभी कोई पिछले वर्ष का पेपर टैग नहीं है — ये इसके सबसे नए मॉक हैं।`,
        subtitleAll: "लाइब्रेरी के सबसे नए पेपर, हल करने के लिए तैयार।",
        practiceAsMock: "मॉक की तरह हल करें",
        viewAll: (c) => (c ? `लाइब्रेरी में सभी ${c} पेपर देखें` : "लाइब्रेरी में सभी पेपर देखें"),
    },
    cbt: {
        eyebrow: "यहीं आज़माइए",
        title: "आपकी परीक्षा स्क्रीन बिल्कुल ऐसी दिखेगी",
        subtitle:
            "यह स्क्रीनशॉट नहीं है — उसी कंप्यूटर-बेस्ड-टेस्ट इंटरफ़ेस का चलता हुआ डेमो है जिसमें यहाँ का हर पेपर चलता है। किसी विकल्प पर टैप कीजिए।",
        demoTitle: "SSC MTS — प्रैक्टिस डेमो",
        questionOf: (n, total) => `प्रश्न ${n} / ${total}`,
        optionsAria: "उत्तर के विकल्प",
        markForReview: "रिव्यू के लिए मार्क करें",
        marked: "मार्क हो गया",
        saveNext: "सेव करें और आगे बढ़ें",
        palette: "क्वेश्चन पैलेट",
        goToQuestion: (n) => `प्रश्न ${n} पर जाएँ`,
        legendAnswered: "उत्तर दिया",
        legendMarked: "रिव्यू के लिए मार्क",
        legendVisited: "देखा, उत्तर नहीं दिया",
        legendNotVisited: "नहीं देखा",
        answeredSuffix: "इस डेमो में उत्तर दिए",
        cta: "पूरा फ्री मॉक दीजिए — वही स्क्रीन, असली पेपर",
        questions: [
            {
                text: "यदि A : B = 3 : 4 और B : C = 8 : 9 है, तो A : C क्या होगा?",
                options: ["1 : 2", "2 : 3", "3 : 4", "27 : 32"],
            },
            // The English-section question stays in English — SSC's own paper is
            // bilingual everywhere EXCEPT the English section, and the demo's
            // job is to look like the real thing.
            { text: "Select the word most opposite in meaning to SCARCE.", options: ["Rare", "Abundant", "Sparse", "Scanty"] },
            {
                text: "श्रृंखला 3, 7, 15, 31, ? में प्रश्नचिह्न की जगह कौन-सी संख्या आएगी?",
                options: ["47", "63", "56", "62"],
            },
        ],
    },
    updates: {
        eyebrow: "ताज़ा अपडेट",
        titleGeneric: "परीक्षा गाइड और रणनीति",
        titleCategory: (c) => `${c} गाइड और रणनीति`,
        minRead: (m) => `${m} मिनट में पढ़ें`,
        pillarLink: "SSC MTS 2026 की पूरी गाइड",
        allGuides: "सभी गाइड",
    },
};
