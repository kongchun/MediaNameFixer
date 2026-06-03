@echo off
chcp 65001 >nul
cls
setlocal EnableDelayedExpansion

:main_menu
cls
echo ==============================================================
echo  媒体与文件综合处理工具
echo ==============================================================
echo.
echo   1 - 仅根据拍摄时间重命名
echo   2 - 拍摄时间优先 无则用文件时间重命名
echo   3 - 提取文件名中的数字日期 转为标准格式
echo   5 - 写入拍摄时间 不修改文件名
echo.
echo  10 - 按年归档
echo  11 - 按年月归档

echo  12 - 合并子文件夹到当前目录
echo.
echo   0 - 退出
echo.
set /p "mode=请输入数字: "

if "%mode%"=="1" goto mode1
if "%mode%"=="2" goto mode2
if "%mode%"=="3" goto mode3
if "%mode%"=="5" goto mode5
if "%mode%"=="10" goto mode10
if "%mode%"=="11" goto mode11
if "%mode%"=="12" goto mode12
if "%mode%"=="0" exit /b 0
goto main_menu

:mode1
echo =============== 模式 1 ===============
exiftool "-FileName<DateTimeOriginal" "-FileName<CreateDate" "-FileName<MediaCreateDate"   -d "%%Y-%%m-%%d %%H%%M%%S%%%%-c.%%%%e" -globalTimeShift 8  -overwrite_original -v2 "./*.MOV" "./*.MP4"
exiftool "-FileName<DateTimeOriginal" "-FileName<CreateDate" "-FileName<MediaCreateDate"   -d "%%Y-%%m-%%d %%H%%M%%S%%%%-c.%%%%e"  -overwrite_original -v2 "./*.JPG" "./*.JPEG" "./*.PNG" "./*.HEIC" "./*.WEBP" "./*.BMP" "./*.TIF" "./*.TIFF" "./*.GIF"
call :fix_number_suffix
goto done

:mode2
echo =============== 模式 2 ===============
exiftool "-FileName<DateTimeOriginal" "-FileName<CreateDate" "-FileName<MediaCreateDate" "-FileName<CreationDate" -d "%%Y-%%m-%%d %%H%%M%%S%%%%-c.%%%%e" -globalTimeShift 8  -overwrite_original -v2 "./*.MOV" "./*.MP4"
exiftool "-FileName<FileCreateDate" "-FileName<FileModifyDate" -d "%%Y-%%m-%%d %%H%%M%%S%%%%-c.%%%%e"  -overwrite_original -v2 "./*.MOV" "./*.MP4"
exiftool "-FileName<DateTimeOriginal" "-FileName<CreateDate" "-FileName<FileCreateDate" "-FileName<FileModifyDate" -d "%%Y-%%m-%%d %%H%%M%%S%%%%-c.%%%%e"  -overwrite_original -v2 "./*.JPG" "./*.JPEG" "./*.PNG" "./*.HEIC" "./*.WEBP" "./*.BMP" "./*.TIF" "./*.TIFF" "./*.GIF"
call :fix_number_suffix
goto done

:mode3
echo =============== 模式 3 ===============
setlocal enabledelayedexpansion
for %%f in (*.MOV *.MP4 *.JPG *.JPEG *.PNG *.HEIC *.WEBP *.BMP *.TIF *.TIFF *.GIF) do (
    set "filename=%%~nf"
    set "ext=%%~xf"
    set "oldname=%%f"
    set "skip=0"

    REM 检查是否已经是标准格式（2025-02-05 121726 或 2025-02-05 121726(1)）
    echo !filename! | findstr /R /C:"^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9][0-9][0-9][0-9][0-9]" >nul
    if !errorlevel! == 0 set "skip=1"

    if "!skip!"=="0" (
        set "digits="
        call :extract_digits

        REM 确保有14位数字（YYYYMMDDHHMMSS）
        set "test14=!digits:~13,1!"
        if defined test14 (
            set "y=!digits:~0,4!"
            set "m=!digits:~4,2!"
            set "d=!digits:~6,2!"
            set "t=!digits:~8,6!"

            set "base=!y!-!m!-!d! !t!"
            set "newname=!base!!ext!"
            set "idx=1"

            call :find_unique_name

            if /I "!newname!"=="!oldname!" (
                echo 无需修改：!oldname!
                echo.
            ) else (
                echo 旧名：!oldname!
                echo 新名：!newname!
                ren "!oldname!" "!newname!" >nul 2>&1
                echo.
            )
        ) else (
            echo 跳过无有效日期：!oldname!
            echo.
        )
    ) else (
        echo 跳过：!oldname!
        echo.
    )
)
echo 模式3 处理完成
goto done

:extract_digits
set "i=0"
set "collecting=0"

:ed_loop
set "char=!filename:~%i%,1!"
if "!char!"=="" goto :ed_done
if "!char!" geq "0" if "!char!" leq "9" (
    set "digits=!digits!!char!"
    set "collecting=1"
) else (
    if "!collecting!"=="1" goto :ed_done
)
set /a i+=1
goto :ed_loop

:ed_done
exit /b

:find_unique_name
if exist "!newname!" (
    set "newname=!base!(!idx!)!ext!"
    set /a idx+=1
    goto :find_unique_name
)
exit /b

:mode5
echo =============== 模式 5 ===============
exiftool -ext JPG -ext JPEG -ext PNG -ext HEIC -ext WEBP -ext BMP -ext TIF -ext TIFF -ext GIF -ext MOV -ext MP4 -if "not $DateTimeOriginal and not $CreateDate and not $MediaCreateDate" "-DateTimeOriginal<FileModifyDate" "-CreateDate<FileModifyDate" "-MediaCreateDate<FileModifyDate" "-CreationDate<FileModifyDate" -overwrite_original -v2 .
goto done

:mode10
echo.
echo [模式] 按年归档 ^(YYYY^)
call :ArchiveByDate YEAR
goto done

:mode11
echo.
echo [模式] 按年月归档 ^(YYYYMM^)
call :ArchiveByDate YEARMONTH
goto done

:mode12
echo.
echo [模式] 合并子文件夹到当前目录
call :MergeSubfolders
goto done

:done
echo.
echo ========================================
echo 处理完成！
echo ========================================
pause
goto main_menu

rem ============================================================
rem 子程序：按日期归档
rem 参数: YEAR 或 YEARMONTH
rem ============================================================
:ArchiveByDate
set "archiveType=%~1"
set /a count=0
set /a skip=0

for %%f in (*.*) do (
    set "fullname=%%f"
    set "filename=%%~nf"
    
    if /I "%%~nxf"=="%~nx0" (
        set /a skip+=1
    ) else (
        set "valid=1"
        
        set "yyyy=!filename:~0,4!"
        set "mm=!filename:~5,2!"
        set "dd=!filename:~8,2!"
        set "dash1=!filename:~4,1!"
        set "dash2=!filename:~7,1!"
        
        echo !yyyy!| findstr "^[0-9][0-9][0-9][0-9]$" >nul
        if errorlevel 1 set "valid=0"
        
        echo !mm!| findstr "^[0-9][0-9]$" >nul
        if errorlevel 1 set "valid=0"
        
        echo !dd!| findstr "^[0-9][0-9]$" >nul
        if errorlevel 1 set "valid=0"
        
        if NOT "!dash1!!dash2!"=="--" set "valid=0"
        
        if !valid!==1 (
            set /a mmNum=1!mm!-100 2>nul
            if !mmNum! LSS 1 set "valid=0"
            if !mmNum! GTR 12 set "valid=0"
        )
        
        if !valid!==1 (
            set /a ddNum=1!dd!-100 2>nul
            if !ddNum! LSS 1 set "valid=0"
            if !ddNum! GTR 31 set "valid=0"
        )
        
        if !valid!==1 (
            if "!archiveType!"=="YEAR" (
                set "folder=!yyyy!"
            ) else (
                set "folder=!yyyy!!mm!"
            )
            if not exist "!folder!" (
                mkdir "!folder!"
                echo [创建] 文件夹: !folder!
            )
            move "!fullname!" "!folder!\" >nul 2>&1
            if !errorlevel!==0 (
                echo [归档] !fullname!  =^>  !folder!
                set /a count+=1
            ) else (
                echo [失败] 无法移动: !fullname!
            )
        ) else (
            echo [跳过] 格式不匹配: !fullname!
            set /a skip+=1
        )
    )
)

echo 归档完成！成功: !count! 个，跳过: !skip! 个
goto :eof

rem ============================================================
rem 子程序：合并子文件夹文件到当前目录
rem ============================================================
:MergeSubfolders
set /a count=0
set /a skip=0
set /a conflict=0

for /d %%d in (*) do (
    for %%f in ("%%d\*.*") do (
        set "src=%%f"
        set "fname=%%~nxf"
        set "base=%%~nf"
        set "ext=%%~xf"
        
        call :GetUniqueName "%%~nf" "%%~xf" dest
        
        move "!src!" "!dest!" >nul 2>&1
        if !errorlevel!==0 (
            if "!dest!"=="!fname!" (
                echo [合并] %%d\!fname!  =^>  !dest!
            ) else (
                echo [合并] %%d\!fname!  =^>  !dest! ^(重命名^)
                set /a conflict+=1
            )
            set /a count+=1
        ) else (
            echo [失败] %%d\!fname!
            set /a skip+=1
        )
    )
)

echo 合并完成！成功: !count! 个，重命名: !conflict! 个，失败: !skip! 个
goto :eof

rem ============================================================
rem 子程序：生成唯一文件名（处理冲突）
rem 参数1: 文件名（无扩展名）
rem 参数2: 扩展名
rem 参数3: 返回变量名
rem ============================================================
:GetUniqueName
set "base=%~1"
set "ext=%~2"
set "result=%base%%ext%"
set "idx=1"

:loop_name
if exist "%result%" (
    set "result=%base%_%idx%%ext%"
    set /a idx+=1
    goto loop_name
)

set "%~3=%result%"
goto :eof

rem ============================================================
rem 子程序：修复数字后缀为括号格式
rem 将 2026-05-24 165621-1.HEIC 转换为 2026-05-24 165621(1).HEIC
rem ============================================================
:fix_number_suffix
echo.
echo [修复] 转换数字后缀为括号格式...
exiftool -v -filename^<"${filename;s/(\d{4}-\d{2}-\d{2} \d{6})-(\d+)(\.[^.]+)$/$1($2)$3/}" -overwrite_original ^
./*.HEIC ^
./*.JPG ^
./*.JPEG ^
./*.PNG ^
./*.MOV ^
./*.MP4 
goto :eof
