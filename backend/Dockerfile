# Build stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy solution and csproj files for optimal layer caching
COPY SchoolAdmission.sln ./
COPY src/SchoolAdmission.Domain/*.csproj ./src/SchoolAdmission.Domain/
COPY src/SchoolAdmission.Application/*.csproj ./src/SchoolAdmission.Application/
COPY src/SchoolAdmission.Infrastructure/*.csproj ./src/SchoolAdmission.Infrastructure/
COPY src/SchoolAdmission.Api/*.csproj ./src/SchoolAdmission.Api/
COPY tests/SchoolAdmission.Tests/*.csproj ./tests/SchoolAdmission.Tests/

RUN dotnet restore

# Copy all source files
COPY . .

# Run test suite during docker build to ensure code integrity
RUN dotnet test tests/SchoolAdmission.Tests/SchoolAdmission.Tests.csproj --no-restore -c Release

# Publish Web API
RUN dotnet publish src/SchoolAdmission.Api/SchoolAdmission.Api.csproj -c Release -o /app/publish --no-restore

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

ENV ASPNETCORE_URLS=http://+:8080
ENV PORT=8080

EXPOSE 8080

COPY --from=build /app/publish .

ENTRYPOINT ["dotnet", "SchoolAdmission.Api.dll"]

