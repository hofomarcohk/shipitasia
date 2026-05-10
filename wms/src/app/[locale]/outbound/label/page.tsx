"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Barcode from "react-barcode";

export default function Page() {
  const searchParams = useSearchParams();
  const uuid = searchParams.get("uuid");
  const [printData, setPrintData] = useState<any>({});

  useEffect(() => {
    if (uuid) {
      setPrintData(JSON.parse(localStorage.getItem(uuid) || "{}"));
      // before close , remove local storage
      window.addEventListener("beforeunload", () => {
        localStorage.removeItem(uuid);
      });
    }
  }, []);

  useEffect(() => {
    if (printData.contactPerson) {
      window.print();
    }
  }, [printData]);

  return (
    <div>
      {printData?.boxes?.map((box: any, i: number) => (
        <div
          className="mt-2 flex flex-col items-center justify-center pagebreak p-2 border border-gray-300 w-fit m-auto"
          key={i}
        >
          <div className="text-center mb-[10px] text-2xl font-bold">
            {printData.contactPerson}
          </div>

          <div className="">
            <Barcode value={box} fontSize={18} height={40} width={2} />
          </div>
        </div>
      ))}
    </div>
  );
}
