/** QR codes — split from the UI kit so the generator only loads where a QR is shown. */
import qrcode from "qrcode-generator";

export function Qr({ text, size = 168 }: { text: string; size?: number }) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  return <div className="qr" style={{ width: size + 28 }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function qrSvg(text: string): string {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
}
