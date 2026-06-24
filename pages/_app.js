import Head from "next/head";

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <style jsx global>{`
        *,
        *::before,
        *::after {
          box-sizing: border-box;
        }
        html,
        body {
          margin: 0;
          padding: 0;
        }
        body {
          font-family:
            "Poppins",
            ui-sans-serif,
            system-ui,
            -apple-system,
            "Segoe UI",
            Roboto,
            sans-serif;
          color: #18211d;
          -webkit-font-smoothing: antialiased;
          background: #eef2ef;
        }
        input,
        button,
        textarea,
        select {
          font-family: inherit;
        }
        button {
          cursor: pointer;
          border: none;
          background: none;
        }
        input::placeholder,
        textarea::placeholder {
          color: #9aa39e;
        }
        ::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }
        ::-webkit-scrollbar-thumb {
          background: #cdd6d1;
          border-radius: 8px;
          border: 3px solid transparent;
          background-clip: content-box;
        }
        @keyframes agToast {
          from {
            opacity: 0;
            transform: translateY(14px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes agScale {
          from {
            opacity: 0;
            transform: scale(0.96);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @media (max-width: 900px) {
          .ag-sidebar {
            display: none !important;
          }
          .ag-topsearch {
            display: none !important;
          }
        }
      `}</style>
      <Component {...pageProps} />
    </>
  );
}
