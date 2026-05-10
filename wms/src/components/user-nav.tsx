import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { get_request } from "@/lib/httpRequest";
import { IconLogout } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";

export function UserNav() {
  const t = useTranslations();
  const [user, setUser] = useState({
    firstName: "",
    lastName: "",
    email: "",
    profilePic: "",
  });
  useEffect(() => {
    get_request("/api/wms/account").then((response) => {
      response.json().then((json) => {
        if (json.data) {
          setUser(json.data);
        }
      });
    });
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-9 w-9">
            {user.profilePic != "" && <AvatarImage src={user.profilePic} />}
            <AvatarFallback>
              {(user.firstName[0] || "...").toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.firstName}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <Link
              href={"/logout"}
              title={t("utils.logout")}
              className="flex items-center space-x-2 justify-between w-full"
            >
              {t("utils.logout")}
              <DropdownMenuShortcut>
                <IconLogout size={14} stroke={1} />
              </DropdownMenuShortcut>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
