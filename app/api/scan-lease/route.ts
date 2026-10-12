import { NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

function getMimeType(file: File): string {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "txt" || ext === "csv") return "text/plain";
  if (file.type && file.type.includes("/")) return file.type;
  return "application/pdf";
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const multiFiles = formData.getAll("files") as File[];
    const singleFile = formData.get("file") as File | null;

    const filesToProcess: File[] =
      multiFiles.length > 0
        ? multiFiles
        : singleFile
        ? [singleFile]
        : [];

    if (filesToProcess.length === 0) {
      return NextResponse.json({ error: "No documents uploaded" }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-3.1-pro-preview",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            site_code: { type: SchemaType.STRING, nullable: true },
            common_name: { type: SchemaType.STRING, nullable: true },
            activity_type: { type: SchemaType.STRING, nullable: true },
            divisional_belonging: { type: SchemaType.STRING, nullable: true },
            legal_entity: { type: SchemaType.STRING, nullable: true },
            status: { type: SchemaType.STRING, nullable: true },
            jv_status: { type: SchemaType.STRING, nullable: true },
            country: { type: SchemaType.STRING, nullable: true },
            state: { type: SchemaType.STRING, nullable: true },
            city: { type: SchemaType.STRING, nullable: true },
            street_address: { type: SchemaType.STRING, nullable: true },
            zip_code: { type: SchemaType.STRING, nullable: true },
            latitude: { type: SchemaType.NUMBER, nullable: true },
            longitude: { type: SchemaType.NUMBER, nullable: true },
            sqm_land: { type: SchemaType.NUMBER, nullable: true },
            sqm_building: { type: SchemaType.NUMBER, nullable: true },
            contract_type: { type: SchemaType.STRING, nullable: true },
            leaseholder: { type: SchemaType.STRING, nullable: true },
            lease_owner: { type: SchemaType.STRING, nullable: true },
            lease_start: { type: SchemaType.STRING, nullable: true },
            lease_end: { type: SchemaType.STRING, nullable: true },
            annual_cost: { type: SchemaType.NUMBER, nullable: true },
            local_currency: { type: SchemaType.STRING, nullable: true },
          },
          required: [
            "site_code",
            "common_name",
            "activity_type",
            "legal_entity",
            "status",
            "jv_status",
            "country",
            "city",
            "street_address",
            "zip_code",
            "latitude",
            "longitude",
            "sqm_building",
            "contract_type",
            "leaseholder",
            "lease_owner",
            "lease_start",
            "lease_end",
            "annual_cost",
            "local_currency",
          ],
        },
      },
    });

    const parts: any[] = [];
    const fileNames: string[] = [];

    for (const file of filesToProcess) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64Data = buffer.toString("base64");
      const mimeType = getMimeType(file);

      parts.push({
        inlineData: {
          data: base64Data,
          mimeType: mimeType,
        },
      });
      fileNames.push(file.name);
    }

    const prompt = `You are a senior commercial real estate lease auditor and data extraction specialist.
You have been provided with ${filesToProcess.length} document(s): ${fileNames.join(", ")}.

CRITICAL INSTRUCTION — PERFORM A COMPLETE DEEP SCAN OF EVERY PAGE OF ALL ATTACHED DOCUMENTS:
Read every page, preamble, basic lease information summary table, schedule, exhibit, addendum, amendment, and signature block across ALL provided documents.
If one document is a Master Lease and another is an Addendum, Amendment, Renewal, or Side Letter, synthesize them and ALWAYS use the most up-to-date amended figures (such as updated rent, extended expiration date, or expanded floor area).

FIELD-BY-FIELD EXTRACTION RULES:
1. "site_code": Generate a logical site code based on the country/city/activity (e.g., "US-DET-O" or "PL-KAT-W"), or use a property code if explicitly stated in the contract.
2. "common_name": Name of the building, industrial park, office center, or "<City> <Activity>" (e.g., "Katowice Office" or "Detroit Technical Center").
3. "activity_type": MUST be one of these exact strings: "Office", "Plant", "Plant On/In-site", "Warehouse", "Warehouse - 3rd Party", "Land", or "Other". Infer from the "Permitted Use" or "Premises" clause.
4. "divisional_belonging": Business division if explicitly mentioned, otherwise "" (empty string).
5. "legal_entity": The full legal name of the Tenant company (our operating entity signing the lease) as written in the preamble/parties section.
6. "status": Set to "Operational".
5. "jv_status": Set to "No" unless a Joint Venture is explicitly stated.
8. "country": Full country name where the premises are located (e.g., "United States", "Poland", "South Africa", "Sweden").
9. "state": State, province, or region name (e.g., "Michigan", "Silesia", "Gauteng"), or "" if not applicable.
10. "city": City or municipality of the leased premises.
11. "street_address": Full street name and building/suite number of the leased premises (do NOT use the landlord's notice address if different from the Premises address).
12. "zip_code": Postal or ZIP code of the leased premises.
13. "latitude": Decimal latitude of the street address and city. If not written in the lease, YOU MUST estimate the accurate decimal latitude for that address/city (e.g., 50.2649). Never leave null if city/country is known.
14. "longitude": Decimal longitude of the street address and city. If not written in the lease, YOU MUST estimate the accurate decimal longitude for that address/city (e.g., 19.0238). Never leave null if city/country is known.
15. "sqm_building": Total rentable/leased building floor area in SQUARE METERS (numeric only).
    - IMPORTANT: If the lease states the area in Square Feet (sq ft / RSF / USF / SF), you MUST convert it to Square Meters by dividing by 10.7639 (i.e. sq_ft * 0.092903) and round to the nearest whole number.
    - If multiple suites/floors are leased across the documents, sum them together.
16. "sqm_land": Total land/plot area in square meters if leased/stated (convert from acres/sq ft if needed), otherwise 0.
17. "contract_type": Set to "Rented/Leased" for leases/subleases, or "Owned" if the document is a title deed / purchase agreement.
18. "leaseholder": Full legal name of the Tenant / Lessee (same as legal_entity).
19. "lease_owner": Full legal name of the Landlord / Lessor / Owner as written in the preamble/parties section.
20. "lease_start": Lease Commencement Date formatted strictly as "YYYY-MM-DD".
21. "lease_end": Lease Expiration / Termination Date formatted strictly as "YYYY-MM-DD" (incorporating any active renewal/extension addendum).
22. "annual_cost": Total current ANNUAL Base Rent as a raw number (no currency symbols or commas).
    - IMPORTANT CALCULATION RULE:
      * If the lease states Monthly Rent (e.g., $15,000/month), multiply by 12 to get the Annual Cost (180000).
      * If the lease states rent per square meter per month (e.g., EUR 14.50/sqm/month), multiply by sqm_building and multiply by 12.
      * If the lease states rent per square foot per year (e.g., $28.00/SF/year), multiply by the total square feet.
      * If there is a rent schedule with step-ups, use the current year's annual base rent (or Year 1 annual base rent if the schedule is not dated).
23. "local_currency": 3-letter ISO currency code used for rent in the contract (e.g., "USD", "EUR", "GBP", "SEK", "ZAR", "PLN").`;

    parts.push({ text: prompt });

    const result = await model.generateContent(parts);
    const rawText = result.