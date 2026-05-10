"use client";

import { get_request } from "@/lib/httpRequest";
import { IconChevronLeft, IconHome } from "@tabler/icons-react";
import { useEffect, useState } from "react";

export default function PdaPageTitleLayout(prop: {
  title: string;
  icon: React.ReactNode;
}) {
  const [user, setUser] = useState({
    firstName: "",
    lastName: "",
    email: "",
    profilePic: "",
    warehouseCode: "",
  });
  useEffect(() => {
    get_request("/api/wms/account").then((response) => {
      response.json().then((json) => {
        setUser(
          json.data || {
            firstName: "",
            lastName: "",
            email: "",
            warehouse: "",
          }
        );
      });
    });
  }, []);

  return (
    <div className="w-full p-2 flex gap-1 justify-between items-center text-[12px] border-b border-gray-200 dark:border-gray-700">
      <div
        className="flex items-center gap-1 cursor-pointer"
        onClick={() => {
          history.back();
        }}
      >
        <IconChevronLeft size={15} stroke={1} />
        {prop.icon}
        <div className="text-[12px] font-bold w-[100px] overflow-hidden ">
          {prop.title}
        </div>
      </div>
      <div className="font-bold flex items-center gap-1">
        <div className="line-clamp-1 w-[80px] overflow-hidden text-right">
          {user.firstName}
        </div>
        <IconHome size={15} stroke={1} />
        {user.warehouseCode && user.warehouseCode != ""
          ? user.warehouseCode
          : "N/A"}
      </div>
    </div>
  );
}
