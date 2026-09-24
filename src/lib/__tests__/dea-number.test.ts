import { checkDeaNumber, formatDeaNumber } from "../dea-number";

let pass = 0, fail = 0;
const chk = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
};

// digits 1234563: (1+3+5) + 2*(2+4+6) = 9 + 24 = 33 → check digit 3
const valid = "AB1234563";
chk("a number with a correct check digit passes", checkDeaNumber(valid).checkDigitValid, true);
chk("and raises nothing", checkDeaNumber(valid).problem, null);

// Same digits, wrong final one.
chk("a wrong check digit is caught", checkDeaNumber("AB1234564").checkDigitValid, false);
chk("and says where to look", checkDeaNumber("AB1234564").problem,
  "That doesn't pass the DEA check digit — worth re-reading off the certificate.");

// The case the check digit exists for.
chk("a transposition is caught", checkDeaNumber("AB2134563").checkDigitValid, false);

chk("lowercase is accepted", checkDeaNumber("ab1234563").formatted, "AB1234563");
chk("spaces and dashes are ignored", checkDeaNumber("AB 1234-563").formatted, "AB1234563");

chk("too few digits is a shape problem", checkDeaNumber("AB123456").wellFormed, false);
chk("digits where letters belong is too", checkDeaNumber("1B1234563").wellFormed, false);
chk("and it explains the shape", checkDeaNumber("AB123").problem,
  "A DEA number is two letters followed by seven digits.");

// An empty field isn't an error, it's an empty field.
chk("nothing typed yet raises nothing", checkDeaNumber("").problem, null);
chk("and isn't claimed to be well-formed", checkDeaNumber("").wellFormed, false);

chk("formatting strips punctuation", formatDeaNumber(" ax-9876543 "), "AX9876543");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
