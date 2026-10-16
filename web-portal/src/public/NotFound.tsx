import { Compass } from "lucide-react";

import { useI18n } from "../lib/i18n.js";
import { Link } from "../lib/router.js";
import { Empty } from "../ui/index.js";
import { PublicFooter, PublicHeader } from "./shared.js";

export function NotFound() {
  const { t } = useI18n();
  return (
    <div className="pub">
      <PublicHeader />
      <main className="pub-wrap pub-narrow" style={{ padding: "70px 0 100px" }}>
        <Empty
          icon={<Compass />}
          title={t("Pagina non trovata", "Page not found")}
          action={
            <Link className="btn btn-primary" to="/">
              {t("Torna alla home", "Back home")}
            </Link>
          }
        >
          {t("Il link potrebbe essere incompleto o non più valido.", "The link may be incomplete or no longer valid.")}
        </Empty>
      </main>
      <PublicFooter />
    </div>
  );
}
