import "./styles/whatsapp.css";

export const metadata = {
  title: "WhatsApp AI Take-Over Control Panel",
  description: "Autonomous WhatsApp AI texting companion and permission gating control panel",
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </head>
      <body>{children}</body>
    </html>
  );
}
