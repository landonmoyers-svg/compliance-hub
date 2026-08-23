import { Nunito_Sans } from "next/font/google";

/**
 * Jane-style typography. Jane.app uses a warm humanist sans; Nunito Sans is the
 * closest widely-available match — slightly rounded terminals, open apertures,
 * friendlier than a neutral grotesk while staying highly legible at small sizes
 * in dense tables.
 */
export const inter = Nunito_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});
